-- ============================================================================
-- EBHS Polymarket — migration 0021: ARENA HEARTBEAT (atomic presence)
--
-- The old client did two calls: upsert last_seen, then a separate RLS-governed
-- SELECT to read who's online. If the table was missing or the read was blocked,
-- the client swallowed the error and showed NOBODY online.
--
-- This replaces that with one SECURITY DEFINER RPC, arena_heartbeat(), that:
--   1. stamps the caller's last_seen = now()
--   2. returns the ids of everyone seen in the last 30 seconds
-- in a single atomic round-trip that bypasses the RLS read entirely.
--
-- Self-contained: creates the arena_presence table if it doesn't exist, so
-- running THIS migration alone fixes presence even if 0018 was never applied.
--
-- Run in the Supabase SQL editor on top of 0001–0020. Re-runnable.
-- ============================================================================

create table if not exists public.arena_presence (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);

alter table public.arena_presence enable row level security;

drop policy if exists arena_presence_sel on public.arena_presence;
create policy arena_presence_sel on public.arena_presence for select using (true);

drop policy if exists arena_presence_ins on public.arena_presence;
create policy arena_presence_ins on public.arena_presence
  for insert with check (user_id = auth.uid());

drop policy if exists arena_presence_upd on public.arena_presence;
create policy arena_presence_upd on public.arena_presence
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.arena_presence to authenticated;

-- Atomic beat + read. Returns a json array of online user ids (uuids as text).
create or replace function public.arena_heartbeat()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ids json;
begin
  if v_uid is null then
    return '[]'::json;
  end if;

  insert into public.arena_presence (user_id, last_seen)
    values (v_uid, now())
    on conflict (user_id) do update set last_seen = now();

  select coalesce(json_agg(user_id), '[]'::json)
    into v_ids
    from public.arena_presence
    where last_seen > now() - interval '30 seconds';

  return v_ids;
end;
$$;

grant execute on function public.arena_heartbeat() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0021.
-- ============================================================================
