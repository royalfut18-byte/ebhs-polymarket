-- ============================================================================
-- EBHS Polymarket — migration 0023: ADMIN BULK APPROVAL ACTIONS
--
-- Two admin-only conveniences for the approval tab:
--   • admin_decline_all_pending()  — decline every pending sign-up at once
--     (keeps them banned; they can still be approved later).
--   • admin_delete_all_declined()  — permanently delete every declined account
--     (cascades through auth.users → profiles → positions like admin_delete_user).
-- Both skip admins for safety and return how many rows they affected.
--
-- Run in the Supabase SQL editor on top of 0001–0022. Re-runnable.
-- ============================================================================

create or replace function public.admin_decline_all_pending()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can decline accounts.';
  end if;

  perform set_config('app.privileged', 'on', true);

  -- Lock the matching accounts out, then mark them declined.
  update auth.users
    set banned_until = now() + interval '100 years'
    where id in (
      select id from public.profiles where approval_status = 'pending' and role <> 'admin'
    );

  update public.profiles
    set approval_status = 'declined'
    where approval_status = 'pending' and role <> 'admin';
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.admin_delete_all_declined()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can delete users.';
  end if;

  -- Deleting the auth users cascades to profiles → positions (and nulls trades).
  with del as (
    delete from auth.users
    where id in (
      select id from public.profiles where approval_status = 'declined' and role <> 'admin'
    )
    returning id
  )
  select count(*) into v_count from del;

  return v_count;
end;
$$;

grant execute on function public.admin_decline_all_pending() to authenticated;
grant execute on function public.admin_delete_all_declined() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0023.
-- ============================================================================
