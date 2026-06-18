-- ============================================================================
-- EBHS Polymarket — migration 0011: CASINO MAX-WIN SAFEGUARD
--
-- Investigation note (the "limbo gives a lot of money" report):
--   Limbo's payout is mathematically a clean 1% house edge —
--     P(win) = 0.99 / target,  payout = bet * target,  EV = 0.99 * bet.
--   It deducts the stake exactly once and credits a win exactly once, and it
--   is safe under rapid/concurrent clicks (the balance update is atomic, and
--   multi-step games lock the round FOR UPDATE). So there is no payout or
--   double-credit bug — a large balance is gambling variance.
--
--   What DOES let a single bet balloon a balance is the *unbounded multiplier*
--   on limbo, crash and hi-lo (and dice via a hand-crafted API target): nothing
--   capped how high a multiplier could go (limbo allowed up to 1,000,000x).
--   This migration caps the effective win multiplier at MAX_MULT = 1000x for
--   those games, which leaves normal play untouched but stops any one bet from
--   minting an absurd, leaderboard-wrecking payout. House edge is unchanged
--   (capping only the rare extreme tail makes it very slightly more, not less,
--   house-favourable).
--
-- Run in the Supabase SQL editor on top of 0001–0010. Re-runnable.
-- ============================================================================

-- DICE — cap the multiplier (UI play tops out ~49.5x; this only bounds a
-- hand-crafted extreme target sent straight to the API).
create or replace function public.casino_dice(p_bet numeric, p_target numeric, p_over boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target numeric := p_target;
  v_roll numeric;
  v_chance numeric;   -- win chance in percent
  v_mult numeric;
  v_win boolean;
  v_payout numeric := 0;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_bet > 1000000 then raise exception 'Bet is too large.'; end if;
  if v_target is null then raise exception 'Pick a target.'; end if;
  if v_target < 0.01 then v_target := 0.01; end if;
  if v_target > 99.99 then v_target := 99.99; end if;

  v_chance := case when p_over then 100 - v_target else v_target end;
  if v_chance < 0.01 then v_chance := 0.01; end if;
  v_mult := round(99.0 / v_chance, 4);
  if v_mult > 1000 then v_mult := 1000; end if;   -- max-win cap

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet
    where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_roll := floor(random() * 10001) / 100.0;          -- 0.00 .. 100.00
  v_win := case when p_over then v_roll > v_target else v_roll < v_target end;

  if v_win then
    v_payout := round(p_bet * v_mult, 2);
    update public.profiles set balance = balance + v_payout where id = v_uid
      returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'dice', p_bet, v_payout, case when v_win then v_mult else 0 end,
          jsonb_build_object('roll', v_roll, 'target', v_target, 'over', p_over, 'win', v_win));

  return json_build_object(
    'win', v_win, 'roll', v_roll, 'target', v_target, 'over', p_over,
    'multiplier', v_mult, 'payout', v_payout, 'new_balance', v_new_balance
  );
end;
$$;

-- LIMBO — cap the target multiplier at 1000x (was 1,000,000x).
create or replace function public.casino_limbo(p_bet numeric, p_target numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target numeric := p_target;
  v_r double precision := random();
  v_result numeric;
  v_win boolean;
  v_payout numeric := 0;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_bet > 1000000 then raise exception 'Bet is too large.'; end if;
  if v_target is null or v_target < 1.01 then raise exception 'Target must be at least 1.01x.'; end if;
  if v_target > 1000 then v_target := 1000; end if;   -- max-win cap (was 1,000,000)

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet
    where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  -- 1% house edge: P(result >= X) = 0.99 / X
  v_result := floor((0.99 / (1 - v_r)) * 100) / 100;
  if v_result < 1.00 then v_result := 1.00; end if;
  v_win := v_result >= v_target;

  if v_win then
    v_payout := round(p_bet * v_target, 2);
    update public.profiles set balance = balance + v_payout where id = v_uid
      returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'limbo', p_bet, v_payout, case when v_win then v_target else 0 end,
          jsonb_build_object('result', v_result, 'target', v_target, 'win', v_win));

  return json_build_object(
    'win', v_win, 'result', v_result, 'target', v_target,
    'payout', v_payout, 'new_balance', v_new_balance
  );
end;
$$;

-- CRASH cash-out — cap the claimed multiplier at 1000x after the anti-cheat clamp.
create or replace function public.casino_crash_cashout(p_round uuid, p_multiplier numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_elapsed double precision; v_server_m numeric; v_crash numeric; v_claim numeric;
  v_status text; v_payout numeric := 0; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'crash' and status = 'active' for update;
  if not found then raise exception 'No active crash game.'; end if;

  v_crash := (r.secret->>'crash')::numeric;
  v_elapsed := extract(epoch from (now() - r.created_at));
  v_server_m := exp(0.06 * v_elapsed);
  v_claim := coalesce(p_multiplier, 1);
  if v_claim < 1 then v_claim := 1; end if;
  -- anti fast-forward: can't claim much more than wall-clock allows
  if v_claim > v_server_m * 1.05 + 0.05 then v_claim := round(v_server_m, 2); end if;
  if v_claim > 1000 then v_claim := 1000; end if;   -- max-win cap

  perform set_config('app.privileged', 'on', true);
  if v_claim >= v_crash then
    v_status := 'lost';
    select balance into v_new_balance from public.profiles where id = v_uid;
  else
    v_status := 'cashed';
    v_payout := round(r.bet * v_claim, 2);
    update public.profiles set balance = balance + v_payout where id = v_uid
      returning balance into v_new_balance;
  end if;

  update public.casino_rounds set status = 'done', payout = v_payout, ended_at = now() where id = p_round;
  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'crash', r.bet, v_payout,
          case when v_status = 'cashed' then v_claim else 0 end,
          jsonb_build_object('crash', v_crash, 'cashed_at', v_claim, 'win', v_status = 'cashed'));

  return json_build_object('status', v_status, 'crash', v_crash,
                           'multiplier', case when v_status = 'cashed' then v_claim else v_crash end,
                           'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

-- HI-LO cash-out — cap the compounded multiplier at 1000x.
create or replace function public.casino_hilo_cashout(p_round uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_mult numeric; v_payout numeric; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'hilo' and status = 'active' for update;
  if not found then raise exception 'No active hi-lo game.'; end if;

  v_mult := (r.secret->>'mult')::numeric;
  if v_mult <= 1 then raise exception 'Make at least one correct guess first.'; end if;
  if v_mult > 1000 then v_mult := 1000; end if;   -- max-win cap

  perform set_config('app.privileged', 'on', true);
  v_payout := round(r.bet * v_mult, 2);
  update public.profiles set balance = balance + v_payout where id = v_uid
    returning balance into v_new_balance;
  update public.casino_rounds set status = 'done', payout = v_payout, ended_at = now() where id = p_round;
  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'hilo', r.bet, v_payout, v_mult, jsonb_build_object('win', true));

  return json_build_object('status', 'cashed', 'multiplier', v_mult, 'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0011.
-- ============================================================================
