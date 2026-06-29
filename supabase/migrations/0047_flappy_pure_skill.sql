-- ============================================================================
-- EBHS Polymarket — migration 0047: Flappy back to PURE SKILL (no random bust)
--
-- The server-authoritative model (0044/0046) was cheat-proof but, by design, the
-- bird crashed in open air when it reached the hidden bust pipe — players read
-- that as "it crashed even though it didn't touch anything." A bettable skill
-- game can't be both cheat-proof AND free of those random crashes, so per the
-- owner's call we go pure skill: the bird ONLY crashes when it actually hits a
-- pipe (client physics). The exploit surface is bounded instead of eliminated --
-- $100 max bet + 10x cap => at most $1000 per round, with farmers handled by hand.
--
-- This restores the pre-0044 server logic:
--   * _flappy_mult: rake curve 0.5 * 1.12^pipes, capped 10x (underwater until ~7
--     pipes, so casual play still carries a house edge).
--   * start: no hidden bust (empty secret), $100 max bet, voids any active round.
--   * cashout: pays mult(pipes), with the claimed pipe count clamped by elapsed
--     time (~1 pipe / 0.8s) so a script can't claim a huge count instantly.
--   * drops the now-unused per-pipe confirm RPC.
--
-- Run in the Supabase SQL editor on top of 0001-0046. Re-runnable.
-- ============================================================================

-- Rake payout curve, capped at 10x.
create or replace function public._flappy_mult(p_pipes int)
returns numeric
language sql
immutable
as $$ select greatest(0, least(round((0.5 * power(1.12, greatest(p_pipes, 0)))::numeric, 2), 10)); $$;

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
  -- script can't claim a huge count instantly. The 10x cap bounds the rest.
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

-- per-pipe confirm is no longer used in pure-skill mode
drop function if exists public.casino_flappy_pipe(uuid);

grant execute on function public._flappy_mult(int)                to authenticated;
grant execute on function public.casino_flappy_start(numeric)     to authenticated;
grant execute on function public.casino_flappy_cashout(uuid, int) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0047.
-- ============================================================================
