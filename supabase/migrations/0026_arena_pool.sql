-- ============================================================================
-- EBHS Polymarket — migration 0026: ARENA POOL (8-ball)
--
-- A third arena game alongside chess and uno. Like chess, the physics + rules
-- run in the browser (a billiards engine can't live in Postgres); the server
-- enforces TURN OWNERSHIP (you may only shoot on your turn) and is the sole
-- payout authority. A game-ending shot parks a pending result that the loser
-- confirms (re-deriving it by replaying the shot), is claimable after a 20s
-- grace, or is voided on dispute → both stakes refunded. Same "balanced" model
-- as chess; worst case is a refund, never theft.
--
-- Pool is a 1-v-1 challenge game (reuses arena_challenge / _respond). State JSON
-- holds ball positions, whose turn, groups, phase, ball-in-hand and the last
-- shot (for replay). Logical table is 200x100; ball radius 2.4 (must match
-- src/lib/arena/pool/physics.ts).
--
-- Run in the Supabase SQL editor on top of 0001–0025. Re-runnable.
-- ============================================================================

-- 1. Allow 'pool' on the matches + challenges check constraints.
alter table public.arena_matches drop constraint if exists arena_matches_game_check;
alter table public.arena_matches
  add constraint arena_matches_game_check check (game in ('chess', 'uno', 'pool'));

alter table public.arena_challenges drop constraint if exists arena_challenges_game_check;
alter table public.arena_challenges
  add constraint arena_challenges_game_check check (game in ('chess', 'uno', 'pool'));

-- 2. The opening rack. Cue at the head spot; 15 object balls racked at the foot
--    (8 in the centre). Positions match the physics module's geometry.
create or replace function public._pool_initial_state()
returns jsonb
language sql
as $$
  select jsonb_set(
    $j${
      "balls": [
        {"i":0,"x":50,"y":50,"in":false},
        {"i":1,"x":150,"y":50,"in":false},
        {"i":2,"x":154.157,"y":47.6,"in":false},
        {"i":9,"x":154.157,"y":52.4,"in":false},
        {"i":3,"x":158.314,"y":45.2,"in":false},
        {"i":8,"x":158.314,"y":50,"in":false},
        {"i":10,"x":158.314,"y":54.8,"in":false},
        {"i":4,"x":162.471,"y":42.8,"in":false},
        {"i":11,"x":162.471,"y":47.6,"in":false},
        {"i":5,"x":162.471,"y":52.4,"in":false},
        {"i":12,"x":162.471,"y":57.2,"in":false},
        {"i":6,"x":166.628,"y":40.4,"in":false},
        {"i":13,"x":166.628,"y":45.2,"in":false},
        {"i":7,"x":166.628,"y":50,"in":false},
        {"i":14,"x":166.628,"y":54.8,"in":false},
        {"i":15,"x":166.628,"y":59.6,"in":false}
      ],
      "turn": 0,
      "groups": {"0": null, "1": null},
      "phase": "break",
      "ballInHand": false,
      "lastShot": null,
      "pending": null
    }$j$::jsonb,
    '{last_shot_at}', to_jsonb(now()::text), true
  );
$$;

-- 3. arena_challenge — allow 'pool' (uno is table-based, not challenge-based).
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
  if p_game not in ('chess', 'pool') then raise exception 'Unknown game.'; end if;
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

-- 4. arena_challenge_respond — branch on game to build the right initial match.
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
  v_a uuid;
  v_b uuid;
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

  -- random seat / colour assignment
  if random() < 0.5 then v_a := c.challenger_id; v_b := c.opponent_id;
  else v_a := c.opponent_id; v_b := c.challenger_id; end if;

  if c.game = 'pool' then
    insert into public.arena_matches (game, status, stake, pot, state)
    values ('pool', 'active', c.stake, c.stake * 2, public._pool_initial_state())
    returning id into v_match;
    insert into public.arena_match_players (match_id, user_id, seat, role, stake) values
      (v_match, v_a, 0, 'p1', c.stake),  -- seat 0 breaks
      (v_match, v_b, 1, 'p2', c.stake);
  else
    insert into public.arena_matches (game, status, stake, pot, state)
    values (c.game, 'active', c.stake, c.stake * 2,
            jsonb_build_object('fen', v_fen, 'moves', '[]'::jsonb,
                               'last_move_at', now(), 'draw_offer', null, 'pending', null))
    returning id into v_match;
    insert into public.arena_match_players (match_id, user_id, seat, role, stake) values
      (v_match, v_a, 0, 'white', c.stake),
      (v_match, v_b, 1, 'black', c.stake);
  end if;

  update public.arena_challenges set status = 'accepted', match_id = v_match where id = p_challenge;
  return json_build_object('ok', true, 'accepted', true, 'match_id', v_match);
end;
$$;

-- 5. Pool play: shoot / confirm / claim / timeout.

-- Store the resolved post-shot state. Guards that the caller is the player whose
-- turn it currently is; trusts the client's computed result (like chess trusts
-- the FEN). p_winner non-null parks a pending result for the opponent.
create or replace function public.arena_pool_shoot(p_match uuid, p_state jsonb, p_winner uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_seat int;
  v_turn int;
  v_pending jsonb := 'null'::jsonb;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and game = 'pool' and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;
  select seat into v_seat from public.arena_match_players where match_id = p_match and user_id = v_uid;
  if v_seat is null then raise exception 'You are not in this match.'; end if;
  v_turn := (m.state->>'turn')::int;
  if v_seat <> v_turn then raise exception 'It is not your turn.'; end if;

  if p_winner is not null then
    v_pending := jsonb_build_object('type', 'win', 'winner', p_winner, 'by', v_uid, 'at', now());
  end if;

  update public.arena_matches
    set state = p_state || jsonb_build_object('pending', v_pending, 'last_shot_at', now()::text),
        updated_at = now()
    where id = p_match;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.arena_pool_confirm(p_match uuid, p_agree boolean)
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
  select * into m from public.arena_matches where id = p_match and game = 'pool' and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;
  if not public.arena_is_player(p_match, v_uid) then raise exception 'You are not in this match.'; end if;

  v_pending := m.state->'pending';
  if v_pending is null or v_pending = 'null'::jsonb then raise exception 'Nothing to confirm.'; end if;
  if (v_pending->>'by')::uuid = v_uid then raise exception 'Waiting on your opponent.'; end if;

  if not p_agree then
    perform public._arena_refund(p_match, 'disputed', true);
    return json_build_object('ok', true, 'result', 'void');
  end if;

  perform public._arena_finish_win(p_match, (v_pending->>'winner')::uuid, 'pool');
  return json_build_object('ok', true, 'result', 'win');
end;
$$;

create or replace function public.arena_pool_claim(p_match uuid)
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
  select * into m from public.arena_matches where id = p_match and game = 'pool' and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;

  v_pending := m.state->'pending';
  if v_pending is null or v_pending = 'null'::jsonb then raise exception 'Nothing to claim.'; end if;
  if (v_pending->>'by')::uuid <> v_uid then raise exception 'Only the declaring player can claim.'; end if;
  if now() < ((v_pending->>'at')::timestamptz + interval '20 seconds') then
    raise exception 'Give your opponent a moment to confirm.';
  end if;

  perform public._arena_finish_win(p_match, (v_pending->>'winner')::uuid, 'pool');
  return json_build_object('ok', true);
end;
$$;

-- Claim the pot when the opponent (the player on the clock) has abandoned the
-- table for over 2 minutes.
create or replace function public.arena_pool_claim_timeout(p_match uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.arena_matches%rowtype;
  v_turn int;
  v_curr uuid;
  v_last timestamptz;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into m from public.arena_matches where id = p_match and game = 'pool' and status = 'active' for update;
  if not found then raise exception 'No active match.'; end if;
  if not public.arena_is_player(p_match, v_uid) then raise exception 'You are not in this match.'; end if;

  v_turn := (m.state->>'turn')::int;
  select user_id into v_curr from public.arena_match_players where match_id = p_match and seat = v_turn;
  if v_curr = v_uid then raise exception 'It is your turn.'; end if;
  v_last := coalesce((m.state->>'last_shot_at')::timestamptz, m.created_at);
  if now() < v_last + interval '2 minutes' then
    raise exception 'Your opponent still has time to shoot.';
  end if;

  perform public._arena_finish_win(p_match, v_uid, 'timeout');
  return json_build_object('ok', true);
end;
$$;

-- 6. Grants
grant execute on function public._pool_initial_state()                       to authenticated;
grant execute on function public.arena_pool_shoot(uuid, jsonb, uuid)         to authenticated;
grant execute on function public.arena_pool_confirm(uuid, boolean)           to authenticated;
grant execute on function public.arena_pool_claim(uuid)                      to authenticated;
grant execute on function public.arena_pool_claim_timeout(uuid)              to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0026.
-- ============================================================================
