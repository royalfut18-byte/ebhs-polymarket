-- ============================================================================
-- EBHS Polymarket — migration 0038: FLAPPY house-edge re-tune
--
-- Problem: the original 0037 curve was 1.14^pipes starting at 1.00x. Passing a
-- single (trivial) pipe paid 1.14x, so cashing out after 1-2 pipes was a
-- near-risk-free +14% — an infinite-money grind, farmable by hand or by a
-- script riding the time-gate, and the 50x cap let a skilled player mine a huge
-- tail. There was no house edge anywhere on the curve.
--
-- Fix: a "rake" curve that starts well below 1x and grows gently, capped low:
--     mult(n) = clamp(0.5 * 1.12^n, 0 .. 10)
-- so a player is underwater until ~7 pipes and only a genuine run turns a
-- profit. Sample payouts (x):
--     pipes:   1     3     5     7     10    15    20    26
--     mult:   0.56  0.70  0.88  1.10  1.55  2.74  4.83  9.53 (cap 10x ~pipe 27)
-- Crashing always forfeits the whole bet (casino_flappy_lose), and the common
-- early crash is now a full house win instead of a payout.
--
-- Also tightens the cashout time-gate grace from +2 to +1 pipes.
--
-- Run in the Supabase SQL editor on top of 0001-0037. Re-runnable.
-- ============================================================================

-- Multiplier after passing N pipes. Rake curve with a built-in house edge.
create or replace function public._flappy_mult(p_pipes int)
returns numeric
language sql
immutable
as $$ select greatest(0, least(round((0.5 * power(1.12, greatest(p_pipes, 0)))::numeric, 2), 10)); $$;

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

  -- Time-gate: at most ~one pipe per 0.8s of real time (+1 grace). Stops a script
  -- from claiming a huge pipe count instantly.
  v_elapsed := extract(epoch from (now() - r.created_at));
  v_max_pipes := floor(v_elapsed / 0.8)::int + 1;
  v_pipes := greatest(0, least(coalesce(p_pipes, 0), v_max_pipes));
  v_mult := public._flappy_mult(v_pipes);

  perform set_config('app.privileged', 'on', true);
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

grant execute on function public._flappy_mult(int)                to authenticated;
grant execute on function public.casino_flappy_cashout(uuid, int) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0038.
-- ============================================================================
