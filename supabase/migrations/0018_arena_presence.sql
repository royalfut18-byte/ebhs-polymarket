-- ============================================================================
-- EBHS Polymarket — migration 0018: ARENA PRESENCE (who's online)
--
-- Realtime Presence over the websocket proved unreliable for the arena lobby,
-- so "who's online" is now a simple DB heartbeat: each lobby client upserts its
-- last_seen every few seconds, and a user is "online" if seen in the last ~30s.
-- This works regardless of the realtime socket state.
--
-- Run in the Supabase SQL editor on top of 0001–0017. Re-runnable.
-- ============================================================================

create table if not exists public.arena_presence (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);

alter table public.arena_presence enable row level security;

-- Anyone signed in can see who's online; you can only beat your own heartbeat.
drop policy if exists arena_presence_sel on public.arena_presence;
create policy arena_presence_sel on public.arena_presence for select using (true);

drop policy if exists arena_presence_ins on public.arena_presence;
create policy arena_presence_ins on public.arena_presence
  for insert with check (user_id = auth.uid());

drop policy if exists arena_presence_upd on public.arena_presence;
create policy arena_presence_upd on public.arena_presence
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.arena_presence to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0018.
-- ============================================================================
