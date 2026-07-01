-- ============================================================================
-- EBHS Polymarket — migration 0052: FLAPPY returns (Season 2)
--
-- Re-adds the Flappy casino game that 0049 removed, as the pure-skill version
-- everyone settled on: the bird only crashes when it actually hits a pipe, and
-- cash-out always pays for the pipes you passed (no server "bust", no random
-- deaths). This time with the owner's hard caps:
--     * max bet   = $100   (enforced in casino_flappy_start)
--     * max mult  = 100x    (enforced in _flappy_mult, reached ~pipe 47)
--
-- Rake payout curve 0.5 * 1.12^pipes: you're underwater until ~7 pipes, so the
-- common early crash is a full-bet house win. The cash-out pipe count is clamped
-- by elapsed time (~1 pipe / 0.8s) so it can't be inflated instantly. Uses
-- casino_rounds, so the abandoned-round logging (_casino_void_active) applies.
--
-- Run in the Supabase SQL editor on top of 0001-0051. Re-runnable.
-- ============================================================================

-- Rake payout curve, capped at 100x.
create or replace function public._flappy_mult(p_pipes int)
returns numeric
language sql
immutable
as $$ select greatest(0, least(round((0.5 * power(1.12, greatest(p_pipes, 0)))::numeric, 2), 100)); $$;

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
  if p_bet > 100 then raise exception 'Max bet on Flappy is $100.'; end if;

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

create or replace function public.casino_flappy_cashout(p_round uuid, p_pipes int default 0)
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

  -- Clamp the claimed pipe count to elapsed time (~1 pipe / 0.8s, +1 grace) so a
  -- script can't claim a huge count instantly. The 100x cap bounds the rest.
  v_elapsed := extract(epoch from (now() - r.created_at));
  v_max_pipes := floor(v_elapsed / 0.8)::int + 1;
  v_pipes := greatest(0, least(coalesce(p_pipes, 0), v_max_pipes));
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

-- Skill crash — bird flew into a pipe. Forfeit the bet.
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
-- End of migration 0052.
-- ============================================================================
