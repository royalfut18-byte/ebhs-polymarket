-- ============================================================================
-- EBHS Polymarket — migration 0017: PVP ARENA (foundation + Chess)
--
-- Real-time, play-money 1-v-1 (and later multiplayer) wagering between users.
--
-- Money model ("balanced"):
--   • Both players' stakes are ESCROWED server-side the moment a challenge is
--     sent / accepted (deducted from balance, behind app.privileged like the
--     rest of the app). The pot = sum of stakes; the winner takes it.
--   • Chess legality is enforced in the browser (a full chess engine can't live
--     in Postgres). The server enforces TURN OWNERSHIP (you can only move on
--     your turn and the move must pass the turn to your opponent) and is the
--     sole authority on PAYOUT. A win is only finalised by: the loser confirming
--     a checkmate, the winner claiming it after a grace period, a resignation,
--     a mutually-agreed draw, or an inactivity timeout. If the players' boards
--     disagree (a faked result), either side disputes and the match VOIDS —
--     both stakes are refunded. Worst case is a refund, never a theft.
--
-- ALL CURRENCY IS FAKE PLAY MONEY. No real money, crypto or wallets.
--
-- Run in the Supabase SQL editor on top of 0001–0016. Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.arena_matches (
  id          uuid primary key default gen_random_uuid(),
  game        text not null check (game in ('chess', 'uno')),
  status      text not null default 'active' check (status in ('active', 'finished', 'void')),
  stake       numeric not null default 0,
  pot         numeric not null default 0,
  state       jsonb not null default '{}'::jsonb,
  winner_id   uuid references public.profiles(id) on delete set null,
  result      text,                       -- checkmate | resign | draw | timeout | disputed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.arena_match_players (
  match_id uuid not null references public.arena_matches(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  seat     int not null default 0,
  role     text,                          -- chess: 'white' | 'black'
  stake    numeric not null default 0,
  outcome  text,                          -- win | loss | draw | void
  primary key (match_id, user_id)
);
create index if not exists idx_amp_user on public.arena_match_players (user_id);

create table if not exists public.arena_challenges (
  id            uuid primary key default gen_random_uuid(),
  game          text not null check (game in ('chess', 'uno')),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id   uuid not null references public.profiles(id) on delete cascade,
  stake         numeric not null default 0,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  match_id      uuid references public.arena_matches(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_arena_ch_opp on public.arena_challenges (opponent_id, status);
create index if not exists idx_arena_ch_chal on public.arena_challenges (challenger_id, status);

create table if not exists public.arena_chat (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.arena_matches(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'msg' check (kind in ('msg', 'reaction')),
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_arena_chat_match on public.arena_chat (match_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. RLS — participants can read their matches / chat; challenges visible to
--    the two parties. All money + state changes go through the RPCs below.
-- ---------------------------------------------------------------------------
alter table public.arena_matches        enable row level security;
alter table public.arena_match_players  enable row level security;
alter table public.arena_challenges      enable row level security;
alter table public.arena_chat            enable row level security;

-- SECURITY DEFINER membership test — avoids RLS recursion on arena_match_players.
create or replace function public.arena_is_player(p_match uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.arena_match_players where match_id = p_match and user_id = p_uid);
$$;
grant execute on function public.arena_is_player(uuid, uuid) to authenticated;

drop policy if exists arena_matches_sel on public.arena_matches;
create policy arena_matches_sel on public.arena_matches
  for select using (public.arena_is_player(id, auth.uid()));

drop policy if exists arena_amp_sel on public.arena_match_players;
create policy arena_amp_sel on public.arena_match_players
  for select using (public.arena_is_player(match_id, auth.uid()));

drop policy if exists arena_ch_sel on public.arena_challenges;
create policy arena_ch_sel on public.arena_challenges
  for select using (challenger_id = auth.uid() or opponent_id = auth.uid());

drop policy if exists arena_chat_sel on public.arena_chat;
create policy arena_chat_sel on public.arena_chat
  for select using (public.arena_is_player(match_id, auth.uid()));

-- Chat carries no money, so clients may insert their own lines directly.
drop policy if exists arena_chat_ins on public.arena_chat;
create policy arena_chat_ins on public.arena_chat
  for insert with check (user_id = auth.uid() and public.arena_is_player(match_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Internal settlement helpers (not exposed to clients)
-- ---------------------------------------------------------------------------

-- Pay the whole pot to one player and close the match.
create or replace function public._arena_finish_win(p_match uuid, p_winner uuid, p_result text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare m public.arena_matches%rowtype;
begin
  select * into m from public.arena_matches where id = p_match for update;
  if not found or m.status <> 'active' then return; end if;   -- idempotent
  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance + m.pot where id = p_winner;
  update public.arena_matches
    set status = 'finished', winner_id = p_winner, result = p_result,
        finished_at = now(), updated_at = now()
    where id = p_match;
  update public.arena_match_players
    set outcome = case when user_id = p_winner then 'win' else 'loss' end
    where match_id = p_match;
end;
$$;

-- Give every player their own stake back. p_void marks a dispute vs a draw.
create or replace function public._arena_refund(p_match uuid, p_result text, p_void boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare m public.arena_matches%rowtype;
begin
  select * into m from public.arena_matches where id = p_match for update;
  if not found or m.status <> 'active' then return; end if;
  perform set_config('app.privileged', 'on', true);
  update public.profiles p set balance = balance + mp.stake
    from public.arena_match_players mp
    where mp.match_id = p_match and mp.user_id = p.id;
  update public.arena_matches
    set status = case when p_void then 'void' else 'finished' end,
        winner_id = null, result = p_result, finished_at = now(), updated_at = now()
    where id = p_match;
  update public.arena_match_players
    set outcome = case when p_void then 'void' else 'draw' end
    where match_id = p_match;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Challenge flow (escrow lives here)
-- ---------------------------------------------------------------------------

create or replace function public.arena_challenge(p_game text, p_opponent uuid, p_stake numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_game not in ('chess', 'uno') then raise exception 'Unknown game.'; end if;
  if p_opponent is null or p_opponent = v_uid then raise exception 'Pick someone else to challenge.'; end if;
  if p_stake is null or p_stake <= 0 then raise exception 'Stake must be greater than zero.'; end if;
  if p_stake > 1000000 then raise exception 'Stake is too large.'; end if;
  if not exists (select 1 from public.profiles where id = p_opponent and approval_status = 'approved') then
    raise exception 'That player is not available.';
  end if;
  if exists (
    select 1 from public.arena_challenges
    where challenger_id = v_uid and opponent_id = p_opponent and game = p_game and status = 'pending'
  ) then
    raise exception 'You already have a pending challenge to that player.';
  end if;

  -- escrow the challenger's stake
  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_stake
    where id = v_uid and balance >= p_stake;
  if not found then raise exception 'Insufficient balance.'; end if;

  insert into public.arena_challenges (game, challenger_id, opponent_id, stake)
  values (p_game, v_uid, p_opponent, p_stake)
  returning id into v_id;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('id', v_id, 'new_balance', v_new_balance);
end;
$$;

create or replace function public.arena_challenge_cancel(p_challenge uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.arena_challenges%rowtype;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into c from public.arena_challenges
    where id = p_challenge and challenger_id = v_uid and status = 'pending' for update;
  if not found then raise exception 'Challenge not found.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance + c.stake where id = c.challenger_id;
  update public.arena_challenges set status = 'cancelled' where id = p_challenge;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.arena_challenge_respond(p_challenge uuid, p_accept boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.arena_challenges%rowtype;
  v_match uuid;
  v_white uuid;
  v_black uuid;
  v_fen text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into c from public.arena_challenges
    where id = p_challenge and opponent_id = v_uid and status = 'pending' for update;
  if not found then raise exception 'Challenge not found.'; end if;

  if not p_accept then
    perform set_config('app.privileged', 'on', true);
    update public.profiles set balance = balance + c.stake where id = c.challenger_id;  -- refund challenger
    update public.arena_challenges set status = 'declined' where id = p_challenge;
    return json_build_object('ok', true, 'accepted', false);
  end if;

  -- escrow the opponent's stake
  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - c.stake
    where id = v_uid and balance >= c.stake;
  if not found then raise exception 'Insufficient balance.'; end if;

  -- random colours
  if random() < 0.5 then v_white := c.challenger_id; v_black := c.opponent_id;
  else v_white := c.opponent_id; v_black := c.challenger_id; end if;

  insert into public.arena_matches (game, status, stake, pot, state)
  values (c.game, 'active', c.stake, c.stake * 2,
          jsonb_build_object('fen', v_fen, 'moves', '[]'::jsonb,
                             'last_move_at', now(), 'draw_offer', null, 'pending', null))
  returning id into v_match;

  insert into public.arena_match_players (match_id, user_id, seat, role, stake) values
    (v_match, v_white, 0, 'white', c.stake),
    (v_match, v_black, 1, 'black', c.stake);

  update public.arena_challenges set status = 'accepted', match_id = v_match where id = p_challenge;
  return json_build_object('ok', true, 'accepted', true, 'match_id', v_match);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Chess play
-- ---------------------------------------------------------------------------

-- Submit a move. The client (chess.js) guarantees legality; the server enforces
-- turn ownership + that the move passes the turn on, records it, and (if the
-- move ends the game) parks a pending result for the opponent to confirm.
create or replace function public.arena_chess_move(
  p_match uuid, p_from text, p_to text, p_promotion text,
  p_san text, p_fen text, p_terminal text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_role text;
  v_turn text;
  v_new_turn text;
  v_pending jsonb := null;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_fen is null then raise exception 'Missing position.'; end if;

  select * into m from public.arena_matches
    where id = p_match and game = 'chess' and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;

  select role into v_role from public.arena_match_players where match_id = p_match and user_id = v_uid;
  if v_role is null then raise exception 'You are not in this match.'; end if;

  v_turn := split_part(m.state->>'fen', ' ', 2);
  if (v_turn = 'w' and v_role <> 'white') or (v_turn = 'b' and v_role <> 'black') then
    raise exception 'Not your turn.';
  end if;

  v_new_turn := split_part(p_fen, ' ', 2);
  if v_new_turn = v_turn then raise exception 'Illegal move (turn must pass).'; end if;

  if p_terminal in ('checkmate', 'stalemate', 'draw') then
    v_pending := jsonb_build_object(
      'type', case when p_terminal = 'checkmate' then 'checkmate' else 'draw' end,
      'by', v_uid, 'winner', case when p_terminal = 'checkmate' then v_uid else null end,
      'at', now()
    );
  end if;

  update public.arena_matches set
    state = jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(m.state, '{fen}', to_jsonb(p_fen)),
                  '{moves}', (m.state->'moves') || jsonb_build_object('from', p_from, 'to', p_to, 'promotion', p_promotion, 'san', p_san)
                ),
                '{last_move_at}', to_jsonb(now())
              ),
              '{draw_offer}', 'null'::jsonb
            ) || jsonb_build_object('pending', v_pending),
    updated_at = now()
    where id = p_match;

  return json_build_object('ok', true, 'pending', v_pending);
end;
$$;

-- The opponent confirms (or disputes) a parked checkmate/draw.
create or replace function public.arena_chess_confirm(p_match uuid, p_agree boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_pending jsonb;
  v_by uuid;
  v_type text;
  v_winner uuid;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches
    where id = p_match and game = 'chess' and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;
  if not public.arena_is_player(p_match, v_uid) then raise exception 'You are not in this match.'; end if;

  v_pending := m.state->'pending';
  if v_pending is null or v_pending = 'null'::jsonb then raise exception 'Nothing to confirm.'; end if;
  v_by := (v_pending->>'by')::uuid;
  if v_by = v_uid then raise exception 'Waiting on your opponent.'; end if;  -- only the other side confirms

  v_type := v_pending->>'type';
  if not p_agree then
    perform public._arena_refund(p_match, 'disputed', true);
    return json_build_object('ok', true, 'result', 'void');
  end if;

  if v_type = 'checkmate' then
    v_winner := (v_pending->>'winner')::uuid;
    perform public._arena_finish_win(p_match, v_winner, 'checkmate');
  else
    perform public._arena_refund(p_match, 'draw', false);
  end if;
  return json_build_object('ok', true, 'result', v_type);
end;
$$;

-- The player who declared the terminal state claims it if the opponent never
-- responds (left the board) — allowed only after a short grace period.
create or replace function public.arena_chess_claim(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_pending jsonb;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches
    where id = p_match and game = 'chess' and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;

  v_pending := m.state->'pending';
  if v_pending is null or v_pending = 'null'::jsonb then raise exception 'Nothing to claim.'; end if;
  if (v_pending->>'by')::uuid <> v_uid then raise exception 'Only the declaring player can claim.'; end if;
  if now() < ((v_pending->>'at')::timestamptz + interval '20 seconds') then
    raise exception 'Give your opponent a moment to confirm.';
  end if;

  if (v_pending->>'type') = 'checkmate' then
    perform public._arena_finish_win(p_match, (v_pending->>'winner')::uuid, 'checkmate');
  else
    perform public._arena_refund(p_match, 'draw', false);
  end if;
  return json_build_object('ok', true);
end;
$$;

-- Resign — the caller forfeits; the opponent takes the pot.
create or replace function public.arena_resign(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_opp uuid;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;
  select user_id into v_opp from public.arena_match_players
    where match_id = p_match and user_id <> v_uid limit 1;
  if v_opp is null then raise exception 'You are not in this match.'; end if;
  if not public.arena_is_player(p_match, v_uid) then raise exception 'You are not in this match.'; end if;

  perform public._arena_finish_win(p_match, v_opp, 'resign');
  return json_build_object('ok', true);
end;
$$;

-- Draw offer / response.
create or replace function public.arena_draw_offer(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); m public.arena_matches%rowtype;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;
  if not public.arena_is_player(p_match, v_uid) then raise exception 'You are not in this match.'; end if;
  update public.arena_matches set state = jsonb_set(state, '{draw_offer}', to_jsonb(v_uid::text)), updated_at = now()
    where id = p_match;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.arena_draw_respond(p_match uuid, p_accept boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); m public.arena_matches%rowtype; v_offer uuid;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;
  if not public.arena_is_player(p_match, v_uid) then raise exception 'You are not in this match.'; end if;
  v_offer := nullif(m.state->>'draw_offer', '')::uuid;
  if v_offer is null then raise exception 'No draw on offer.'; end if;
  if v_offer = v_uid then raise exception 'Waiting on your opponent.'; end if;

  if p_accept then
    perform public._arena_refund(p_match, 'draw', false);
    return json_build_object('ok', true, 'result', 'draw');
  else
    update public.arena_matches set state = jsonb_set(state, '{draw_offer}', 'null'::jsonb), updated_at = now()
      where id = p_match;
    return json_build_object('ok', true, 'result', 'declined');
  end if;
end;
$$;

-- Claim a win when the opponent has abandoned the board (their clock ran for
-- more than 2 minutes since the last move while it was their turn).
create or replace function public.arena_claim_timeout(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_role text;
  v_turn text;
  v_last timestamptz;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;
  select role into v_role from public.arena_match_players where match_id = p_match and user_id = v_uid;
  if v_role is null then raise exception 'You are not in this match.'; end if;

  v_turn := split_part(m.state->>'fen', ' ', 2);
  -- the player to move is "on the clock"; you may only claim when you're waiting
  if (v_turn = 'w' and v_role = 'white') or (v_turn = 'b' and v_role = 'black') then
    raise exception 'It is your turn.';
  end if;
  v_last := coalesce((m.state->>'last_move_at')::timestamptz, m.created_at);
  if now() < v_last + interval '2 minutes' then
    raise exception 'Your opponent still has time to move.';
  end if;

  perform public._arena_finish_win(p_match, v_uid, 'timeout');
  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants + realtime
-- ---------------------------------------------------------------------------
grant select on public.arena_matches       to authenticated;
grant select on public.arena_match_players to authenticated;
grant select on public.arena_challenges     to authenticated;
grant select, insert on public.arena_chat   to authenticated;

grant execute on function public.arena_challenge(text, uuid, numeric)        to authenticated;
grant execute on function public.arena_challenge_cancel(uuid)                to authenticated;
grant execute on function public.arena_challenge_respond(uuid, boolean)      to authenticated;
grant execute on function public.arena_chess_move(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.arena_chess_confirm(uuid, boolean)          to authenticated;
grant execute on function public.arena_chess_claim(uuid)                     to authenticated;
grant execute on function public.arena_resign(uuid)                          to authenticated;
grant execute on function public.arena_draw_offer(uuid)                      to authenticated;
grant execute on function public.arena_draw_respond(uuid, boolean)           to authenticated;
grant execute on function public.arena_claim_timeout(uuid)                   to authenticated;

-- Enable realtime (postgres_changes) on the arena tables, if the publication
-- exists (it does on Supabase cloud). Guarded so the migration is re-runnable.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arena_matches') then
      alter publication supabase_realtime add table public.arena_matches;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arena_challenges') then
      alter publication supabase_realtime add table public.arena_challenges;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arena_chat') then
      alter publication supabase_realtime add table public.arena_chat;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0017.
-- ============================================================================
