-- ============================================================================
-- EBHS Polymarket — migration 0044: make FLAPPY cheat-proof (server-authoritative)
--
-- THE LEAK: Flappy ran 266% RTP (-$330k) because the whole game lives in the
-- browser and the server just trusted the pipe count the client handed it on
-- cash-out (clamped only by a loose time-gate). A cheater opened the console,
-- waited ~53s, and called casino_flappy_cashout with p_pipes:67 without ever
-- flapping -> 992x -> $99k. No payout-curve tweak can fix a client-decided
-- outcome; the server has to decide it.
--
-- THE FIX: roll a hidden "bust pipe" at start, exactly like Crash rolls a hidden
-- crash point. Geometric with per-pipe survival s=0.88, so P(reach n) = 0.88^n.
-- The payout curve mult(n) = (1-edge)/s^n with edge=5%, which makes the expected
-- return EXACTLY 0.95 at EVERY cash-out point n:
--     EV(cash at n) = P(reach n) * mult(n) = 0.88^n * 0.95/0.88^n = 0.95
-- so a 5% house edge holds no matter how many pipes are claimed — claiming a
-- huge count just busts against the hidden point. Cheating earns negative EV.
-- No cap needed (a 1000x safety ceiling sits at ~pipe 54, unreachable in play).
--
--   pipes:  1     3     5     10    20     30     54
--   mult:  1.08  1.39  1.80  3.41  12.2   43.8   1000 (safety cap)
--   chance you can reach it: 88%  68%   53%   28%   8%    2%    0.1%
--
-- Skill still matters: hitting a pipe (casino_flappy_lose) ends the run early.
-- The hidden bust is the ceiling a bot/cheat can't beat. $100 max bet stays.
--
-- Run in the Supabase SQL editor on top of 0001-0043. Re-runnable.
-- ============================================================================

-- House-edge payout curve: (1-edge)/s^pipes, edge 5%, s 0.88. Capped 1000x.
create or replace function public._flappy_mult(p_pipes int)
returns numeric
language sql
immutable
as $$ select round(least(0.95 / power(0.88, greatest(p_pipes, 0))::numeric, 1000), 2); $$;

create or replace function public.casino_flappy_start(p_bet numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_round_id uuid;
  v_new_balance numeric;
  v_bust int;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_bet > 100 then raise exception 'Max bet on Flappy is $100.'; end if;

  perform public._casino_void_active(v_uid, 'flappy');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  -- Hidden bust pipe: largest n the player can safely pass. P(bust >= n) = 0.88^n.
  -- (greatest() guards the astronomically unlikely random()=0.)
  v_bust := floor(ln(greatest(random(), 1e-12)) / ln(0.88))::int;

  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'flappy', p_bet, 'active', jsonb_build_object('bust', v_bust))
  returning id into v_round_id;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('round_id', v_round_id, 'new_balance', v_new_balance);
end;
$$;

create or replace function public.casino_flappy_cashout(p_round uuid, p_pipes int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_elapsed double precision;
  v_max_pipes int;
  v_pipes int;
  v_bust int;
  v_mult numeric;
  v_payout numeric;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'flappy' and status = 'active' for update;
  if not found then raise exception 'No active flappy game.'; end if;

  -- Time-gate the claim (can't have passed more pipes than there was time for),
  -- then the hidden bust decides win vs loss — so an inflated claim just busts.
  v_elapsed := extract(epoch from (now() - r.created_at));
  v_max_pipes := floor(v_elapsed / 0.8)::int + 1;
  v_pipes := greatest(0, least(coalesce(p_pipes, 0), v_max_pipes));
  v_bust := coalesce((r.secret->>'bust')::int, 0);

  perform set_config('app.privileged', 'on', true);

  if v_pipes > v_bust then
    -- pushed past the hidden bust -> the gap closed on you
    update public.casino_rounds set status = 'done', payout = 0, ended_at = now() where id = p_round;
    insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
    values (v_uid, 'flappy', r.bet, 0, 0,
            jsonb_build_object('pipes', v_pipes, 'bust_at', v_bust, 'win', false));
    select balance into v_new_balance from public.profiles where id = v_uid;
    return json_build_object('status', 'bust', 'pipes', v_pipes, 'bust_at', v_bust,
                             'multiplier', 0, 'payout', 0, 'new_balance', v_new_balance);
  end if;

  v_mult := public._flappy_mult(v_pipes);
  v_payout := round(r.bet * v_mult, 2);
  update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  update public.casino_rounds set status = 'done', payout = v_payout, ended_at = now() where id = p_round;
  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'flappy', r.bet, v_payout, v_mult,
          jsonb_build_object('pipes', v_pipes, 'win', v_payout > r.bet));

  return json_build_object('status', 'cashed', 'pipes', v_pipes, 'multiplier', v_mult,
                           'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

-- Skill crash (bird hit a pipe) — unchanged: forfeit the bet.
create or replace function public.casino_flappy_lose(p_round uuid, p_pipes int default 0)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'flappy' and status = 'active' for update;
  if not found then raise exception 'No active flappy game.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.casino_rounds set status = 'done', payout = 0, ended_at = now() where id = p_round;
  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'flappy', r.bet, 0, 0, jsonb_build_object('pipes', greatest(0, coalesce(p_pipes, 0)), 'win', false));

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('status', 'crashed', 'new_balance', v_new_balance);
end;
$$;

grant execute on function public._flappy_mult(int)                to authenticated;
grant execute on function public.casino_flappy_start(numeric)     to authenticated;
grant execute on function public.casino_flappy_cashout(uuid, int) to authenticated;
grant execute on function public.casino_flappy_lose(uuid, int)    to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0044.
-- ============================================================================
