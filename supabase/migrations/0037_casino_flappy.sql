-- ============================================================================
-- EBHS Polymarket — migration 0037: FLAPPY BIRD casino game
--
-- A skill "cash out as you go" game. You bet, fly, and every pipe you pass grows
-- your multiplier (mult = 1.14^pipes, capped at 50x). Cash out anytime; crash
-- and you lose the bet. Server-authoritative on money: the bet + payout are
-- decided here, and the cashout pipe count is clamped by elapsed time so it
-- can't be inflated by a script (you can't have passed more pipes than there
-- was time for). Uses casino_rounds, so the 0035 abandoned-round logging and
-- the 0036 no-max-bet already apply.
--
-- Run in the Supabase SQL editor on top of 0001–0036. Re-runnable.
-- ============================================================================

-- Multiplier after passing N pipes (geometric, capped). Server is authoritative.
create or replace function public._flappy_mult(p_pipes int)
returns numeric
language sql
immutable
as $$ select least(round(power(1.14, greatest(p_pipes, 0))::numeric, 2), 50); $$;

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
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;

  perform public._casino_void_active(v_uid, 'flappy');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'flappy', p_bet, 'active', '{}'::jsonb)
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
  v_mult numeric;
  v_payout numeric;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'flappy' and status = 'active' for update;
  if not found then raise exception 'No active flappy game.'; end if;

  -- Time-gate: at most ~one pipe per 0.8s of real time (+2 grace). Stops a script
  -- from claiming a huge pipe count instantly.
  v_elapsed := extract(epoch from (now() - r.created_at));
  v_max_pipes := floor(v_elapsed / 0.8)::int + 2;
  v_pipes := greatest(0, least(coalesce(p_pipes, 0), v_max_pipes));
  v_mult := public._flappy_mult(v_pipes);

  perform set_config('app.privileged', 'on', true);
  v_payout := round(r.bet * v_mult, 2);
  update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  update public.casino_rounds set status = 'done', payout = v_payout, ended_at = now() where id = p_round;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'flappy', r.bet, v_payout, v_mult,
          jsonb_build_object('pipes', v_pipes, 'win', true));

  return json_build_object('status', 'cashed', 'pipes', v_pipes, 'multiplier', v_mult,
                           'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

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

grant execute on function public._flappy_mult(int)                  to authenticated;
grant execute on function public.casino_flappy_start(numeric)       to authenticated;
grant execute on function public.casino_flappy_cashout(uuid, int)   to authenticated;
grant execute on function public.casino_flappy_lose(uuid, int)      to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0037.
-- ============================================================================
