-- ============================================================================
-- EBHS Polymarket — migration 0002 (feature update)
--
-- Adds:
--   • profiles_private  — real name + Instagram, visible ONLY to the user and admins
--   • app_settings      — key/value config (used for leaderboard prizes)
--   • admin_messages    — staff-only chat
--   • market_suggestions— user-submitted market ideas
--   • set_setting() RPC — admin-only settings writer
--   • makes the public display name equal the username (no real names leak)
--
-- Run this in the Supabase SQL editor on top of 0001_init.sql. Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Private profile data (real name + Instagram) — admin or self only
-- ---------------------------------------------------------------------------
create table if not exists public.profiles_private (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  full_name  text not null default '',
  instagram  text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.profiles_private enable row level security;

drop policy if exists pp_select on public.profiles_private;
create policy pp_select on public.profiles_private for select
  using (auth.uid() = user_id or public.current_user_role() = 'admin');

drop policy if exists pp_update_own on public.profiles_private;
create policy pp_update_own on public.profiles_private for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.profiles_private to authenticated;

-- ---------------------------------------------------------------------------
-- 2. App settings (key/value) — public read, admin-only write via RPC
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists settings_select_all on public.app_settings;
create policy settings_select_all on public.app_settings for select using (true);

grant select on public.app_settings to anon, authenticated;

create or replace function public.set_setting(p_key text, p_value jsonb)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare s public.app_settings;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can change settings.';
  end if;
  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into s;
  return s;
end;
$$;

grant execute on function public.set_setting(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin/sub-admin chat
-- ---------------------------------------------------------------------------
create table if not exists public.admin_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_messages_created on public.admin_messages (created_at);

alter table public.admin_messages enable row level security;

drop policy if exists admin_msg_select on public.admin_messages;
create policy admin_msg_select on public.admin_messages for select
  using (public.current_user_role() in ('admin', 'subadmin'));

drop policy if exists admin_msg_insert on public.admin_messages;
create policy admin_msg_insert on public.admin_messages for insert
  with check (auth.uid() = user_id and public.current_user_role() in ('admin', 'subadmin'));

grant select, insert on public.admin_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Market suggestions (from users)
-- ---------------------------------------------------------------------------
create table if not exists public.market_suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  question    text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_market_suggestions_created on public.market_suggestions (created_at);

alter table public.market_suggestions enable row level security;

drop policy if exists ms_select on public.market_suggestions;
create policy ms_select on public.market_suggestions for select
  using (public.current_user_role() in ('admin', 'subadmin') or auth.uid() = user_id);

drop policy if exists ms_insert on public.market_suggestions;
create policy ms_insert on public.market_suggestions for insert
  with check (auth.uid() = user_id);

drop policy if exists ms_delete on public.market_suggestions;
create policy ms_delete on public.market_suggestions for delete
  using (public.current_user_role() in ('admin', 'subadmin') or auth.uid() = user_id);

grant select, insert, delete on public.market_suggestions to authenticated;

-- ---------------------------------------------------------------------------
-- 5. New-user trigger: public display_name = username; real name + Instagram
--    go into the private table.
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
  insert into public.profiles (id, username, display_name, role, balance)
  values (new.id, v_username, v_username, 'user', 1000);

  -- private profile: real name + Instagram (admin/self only)
  insert into public.profiles_private (user_id, full_name, instagram)
  values (new.id, v_full, v_insta)
  on conflict (user_id) do update
    set full_name = excluded.full_name, instagram = excluded.instagram;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Backfill existing users: move any old display_name into the private
--    full_name, then set the public display_name to the username.
-- ---------------------------------------------------------------------------
insert into public.profiles_private (user_id, full_name, instagram)
select id, display_name, '' from public.profiles
on conflict (user_id) do nothing;

update public.profiles set display_name = username where display_name <> username;

-- ============================================================================
-- End of migration 0002.
-- ============================================================================
