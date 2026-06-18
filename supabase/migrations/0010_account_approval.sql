-- ============================================================================
-- EBHS Polymarket — migration 0010: ACCOUNT APPROVAL
--
-- New sign-ups must be approved by an admin before they can use the app.
--
-- How it works:
--   • profiles.approval_status: 'pending' | 'approved' | 'declined'.
--   • A new sign-up lands as 'pending' AND is banned in auth.users (a far-future
--     banned_until), so GoTrue refuses to issue a session — the user genuinely
--     cannot authenticate, and therefore cannot reach ANY authenticated RPC
--     (trading, casino, spin, etc.). This is the real, server-side gate; the
--     "waiting for approval" screen is just the matching UX.
--   • An admin approves  -> status 'approved' + the ban is lifted (can log in).
--     An admin declines  -> status 'declined' + stays banned (cannot log in).
--   • The profile-protection trigger now also blocks a user from editing their
--     own approval_status, so nobody can self-approve.
--   • Existing users are grandfathered in as 'approved' (one-time backfill) so
--     this migration never locks out the current admin or players.
--
-- Precedent: admin_delete_user() in 0007 already writes to auth.users from a
-- SECURITY DEFINER function, so updating auth.users.banned_until here is safe.
--
-- Run in the Supabase SQL editor on top of 0001–0009. Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. approval_status column (+ one-time grandfather of existing users)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'approval_status'
  ) then
    alter table public.profiles
      add column approval_status text not null default 'pending';

    -- Everyone who already exists predates approvals — let them straight in.
    update public.profiles set approval_status = 'approved';

    alter table public.profiles
      add constraint profiles_approval_status_chk
      check (approval_status in ('pending', 'approved', 'declined'));
  end if;
end $$;

create index if not exists idx_profiles_approval on public.profiles (approval_status);

-- ---------------------------------------------------------------------------
-- 2. Profile-protection: also forbid a user changing their own approval_status
--    (only privileged RPCs / the service role may). Mirrors 0001 §4.
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.privileged', true) is distinct from 'on'
     and current_user not in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
  then
    if new.role            is distinct from old.role            then raise exception 'You cannot change your role.'; end if;
    if new.balance         is distinct from old.balance         then raise exception 'You cannot change your balance.'; end if;
    if new.username        is distinct from old.username        then raise exception 'You cannot change your username.'; end if;
    if new.id              is distinct from old.id              then raise exception 'You cannot change your id.'; end if;
    if new.approval_status is distinct from old.approval_status then raise exception 'You cannot change your approval status.'; end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. New-user trigger: create the profile as 'pending' and ban the auth user
--    until an admin approves. Preserves the private name/Instagram insert (0002).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_full     text;
  v_insta    text;
begin
  v_username := coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1));
  v_full     := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_insta    := coalesce(new.raw_user_meta_data ->> 'instagram', '');

  -- public profile: display_name is just the username (no real names in public)
  insert into public.profiles (id, username, display_name, role, balance, approval_status)
  values (new.id, v_username, v_username, 'user', 1000, 'pending');

  -- private profile: real name + Instagram (admin/self only)
  insert into public.profiles_private (user_id, full_name, instagram)
  values (new.id, v_full, v_insta)
  on conflict (user_id) do update
    set full_name = excluded.full_name, instagram = excluded.instagram;

  -- Lock the account out of authentication until approved. A concrete far-future
  -- timestamp is used (not 'infinity', which some drivers mishandle).
  update auth.users
    set banned_until = now() + interval '100 years'
    where id = new.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Admin approve / decline RPCs
-- ---------------------------------------------------------------------------

-- Approve a pending (or previously declined) user: let them authenticate.
create or replace function public.admin_approve_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare pr public.profiles;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can approve accounts.';
  end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set approval_status = 'approved' where id = p_user_id
    returning * into pr;
  if not found then raise exception 'User not found.'; end if;

  -- lift the ban so GoTrue will issue a session on next login
  update auth.users set banned_until = null where id = p_user_id;

  return pr;
end;
$$;

-- Decline a pending account: keep it banned (it cannot log in) and record it.
create or replace function public.admin_decline_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare pr public.profiles; v_role user_role;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can decline accounts.';
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if v_role is null then raise exception 'User not found.'; end if;
  if v_role = 'admin' then raise exception 'You cannot decline an admin.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set approval_status = 'declined' where id = p_user_id
    returning * into pr;

  update auth.users
    set banned_until = now() + interval '100 years'
    where id = p_user_id;

  return pr;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Leaderboard view: only show approved players (pending/declined accounts
--    are hidden from the public board). Mirrors 0001 §10 + the approval filter.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard as
select
  p.id,
  p.username,
  p.display_name,
  p.role,
  p.balance,
  p.balance + coalesce((
    select sum(
      pos.shares * (
        case when pos.outcome = 'yes'
          then public.lmsr_price_yes(m.q_yes, m.q_no, m.b)
          else 1 - public.lmsr_price_yes(m.q_yes, m.q_no, m.b)
        end
      )
    )
    from public.positions pos
    join public.markets m on m.id = pos.market_id
    where pos.user_id = p.id and m.status in ('open', 'closed')
  ), 0) as net_worth
from public.profiles p
where p.approval_status = 'approved';

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
grant select on public.leaderboard to anon, authenticated;
grant execute on function public.admin_approve_user(uuid) to authenticated;
grant execute on function public.admin_decline_user(uuid) to authenticated;

-- Tell PostgREST to pick up the new functions.
notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0010.
-- ============================================================================
