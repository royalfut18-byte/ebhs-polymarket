-- ============================================================================
-- EBHS Polymarket — migration 0039: FLAPPY $100 max bet
--
-- Flappy is the only skill game in the casino, so a big bet on it is the one
-- place a strong player can do real damage. Cap the Flappy bet at $100. The
-- other (chance) games keep their built-in edge and stay uncapped (per 0036).
--
-- Server-authoritative: the client also clamps the input, but this is the guard
-- that actually matters. Only casino_flappy_start changes.
--
-- Run in the Supabase SQL editor on top of 0001-0038. Re-runnable.
-- ============================================================================

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

grant execute on function public.casino_flappy_start(numeric) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0039.
-- ============================================================================
