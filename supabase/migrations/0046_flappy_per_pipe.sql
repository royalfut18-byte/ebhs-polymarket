-- ============================================================================
-- EBHS Polymarket — migration 0046: Flappy per-pipe confirmation (fixes "cashed
-- out but it said crashed")
--
-- 0044 made Flappy server-authoritative but compared the CLAIMED pipe count to
-- the hidden bust only at cash-out. So if the hidden bust was pipe 1 and you flew
-- to pipe 3 then cashed out, the server busted you — from the player's side that's
-- "I cashed out and lost", which feels broken.
--
-- Fix: confirm each pipe AS IT IS PASSED (casino_flappy_pipe). The server checks
-- that pipe against the hidden bust and, if it's the gap, ends the round right
-- there (the bird visibly crashes). So the bird can never fly PAST the bust and
-- then cash out — the confirmed count is always <= bust. Cash-out therefore pays
-- the server's own confirmed count and can NEVER bust.
--
-- Same hidden-bust model and house edge as 0044 (survival 0.88, mult 0.95/0.88^n,
-- flat 0.95 EV at every cash-out point) — still cheat-proof, still uncapped.
--
-- Run in the Supabase SQL editor on top of 0001-0045. Re-runnable.
-- ============================================================================

-- payout curve unchanged from 0044 (kept here so this migration is self-contained)
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
  v_bust := floor(ln(greatest(random(), 1e-12)) / ln(0.88))::int;

  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'flappy', p_bet, 'active', jsonb_build_object('bust', v_bust, 'pipes', 0))
  returning id into v_round_id;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('round_id', v_round_id, 'new_balance', v_new_balance);
end;
$$;

-- Confirm one passed pipe. Survives if it's not the hidden bust; otherwise the
-- run ends here (the bird hit the gap) and the loss is logged.
create or replace function public.casino_flappy_pipe(p_round uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_pipes int;
  v_bust int;
  v_new int;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'flappy' and status = 'active' for update;
  if not found then raise exception 'No active flappy game.'; end if;

  v_pipes := coalesce((r.secret->>'pipes')::int, 0);
  v_bust := coalesce((r.secret->>'bust')::int, 0);
  v_new := v_pipes + 1;

  perform set_config('app.privileged', 'on', true);

  if v_new > v_bust then
    -- the hidden gap — crash here (you safely passed v_pipes)
    update public.casino_rounds set status = 'done', payout = 0, ended_at = now() where id = p_round;
    insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
    values (v_uid, 'flappy', r.bet, 0, 0, jsonb_build_object('pipes', v_pipes, 'win', false));
    select balance into v_new_balance from public.profiles where id = v_uid;
    return json_build_object('status', 'bust', 'pipes', v_pipes, 'new_balance', v_new_balance);
  end if;

  update public.casino_rounds set secret = jsonb_set(r.secret, '{pipes}', to_jsonb(v_new)) where id = p_round;
  return json_build_object('status', 'safe', 'pipes', v_new, 'multiplier', public._flappy_mult(v_new));
end;
$$;

-- Cash out the server's CONFIRMED pipe count — always a payout, never a bust.
-- p_pipes is ignored (kept for the existing call signature).
create or replace function public.casino_flappy_cashout(p_round uuid, p_pipes int default 0)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_pipes int;
  v_mult numeric;
  v_payout numeric;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'flappy' and status = 'active' for update;
  if not found then raise exception 'No active flappy game.'; end if;

  v_pipes := coalesce((r.secret->>'pipes')::int, 0);
  v_mult := public._flappy_mult(v_pipes);

  perform set_config('app.privileged', 'on', true);
  v_payout := round(r.bet * v_mult, 2);
  update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  update public.casino_rounds set status = 'done', payout = v_payout, ended_at = now() where id = p_round;
  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'flappy', r.bet, v_payout, v_mult, jsonb_build_object('pipes', v_pipes, 'win', v_payout > r.bet));

  return json_build_object('status', 'cashed', 'pipes', v_pipes, 'multiplier', v_mult,
                           'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

grant execute on function public._flappy_mult(int)                to authenticated;
grant execute on function public.casino_flappy_start(numeric)     to authenticated;
grant execute on function public.casino_flappy_pipe(uuid)         to authenticated;
grant execute on function public.casino_flappy_cashout(uuid, int) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0046.
-- ============================================================================
