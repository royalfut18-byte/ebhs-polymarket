-- ============================================================================
-- EBHS Polymarket — migration 0035: log ABANDONED multi-step rounds as losses
--
-- Multi-step games (mines/blackjack/crash/hi-lo) deduct the bet when a round
-- STARTS but only write to casino_bets when it SETTLES. Starting a new round
-- while one was active silently marked the old one 'done' with NO casino_bets
-- row — so the lost bet was missing from history. That made per-game RTP read
-- ABOVE 100% (losses undercounted), broke the activity feed, and hid the true
-- house edge.
--
-- Fix: when a start abandons an active round, record it as a loss
-- (bet wagered, payout 0) via _casino_void_active(). Now casino_bets is a
-- complete ledger and RTP is accurate.
--
-- Run in the Supabase SQL editor on top of 0001–0034. Re-runnable.
-- ============================================================================

create or replace function public._casino_void_active(p_uid uuid, p_game text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.casino_rounds%rowtype;
begin
  for r in
    select * from public.casino_rounds
    where user_id = p_uid and game = p_game and status = 'active'
    for update
  loop
    update public.casino_rounds set status = 'done', ended_at = now() where id = r.id;
    -- the bet was already deducted at start and is forfeited → log it as a loss
    insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
    values (p_uid, p_game, r.bet, 0, 0, jsonb_build_object('abandoned', true, 'win', false));
  end loop;
end;
$$;

-- ---- mines ----------------------------------------------------------------
create or replace function public.casino_mines_start(p_bet numeric, p_mines int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mine_pos int[];
  v_round_id uuid;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_bet > 1000000 then raise exception 'Bet is too large.'; end if;
  if p_mines is null or p_mines < 1 or p_mines > 24 then raise exception 'Choose 1 to 24 mines.'; end if;

  perform public._casino_void_active(v_uid, 'mines');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet
    where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_mine_pos := array(select g from generate_series(0, 24) g order by random() limit p_mines);

  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'mines', p_bet, 'active',
          jsonb_build_object('mines', v_mine_pos, 'count', p_mines, 'revealed', '[]'::jsonb))
  returning id into v_round_id;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('round_id', v_round_id, 'mines', p_mines, 'new_balance', v_new_balance);
end;
$$;

-- ---- crash ----------------------------------------------------------------
create or replace function public.casino_crash_start(p_bet numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_r double precision := random();
  v_crash numeric;
  v_round_id uuid; v_started timestamptz; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_bet > 1000000 then raise exception 'Bet is too large.'; end if;

  perform public._casino_void_active(v_uid, 'crash');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet
    where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  -- 1% edge: P(crash >= X) = 0.99 / X
  v_crash := floor((0.99 / (1 - v_r)) * 100) / 100;
  if v_crash < 1.00 then v_crash := 1.00; end if;

  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'crash', p_bet, 'active', jsonb_build_object('crash', v_crash))
  returning id, created_at into v_round_id, v_started;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('round_id', v_round_id, 'started_at', v_started, 'new_balance', v_new_balance);
end;
$$;

-- ---- hi-lo ----------------------------------------------------------------
create or replace function public.casino_hilo_start(p_bet numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_card jsonb; v_round_id uuid; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_bet > 1000000 then raise exception 'Bet is too large.'; end if;

  perform public._casino_void_active(v_uid, 'hilo');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet
    where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_card := _casino_card();
  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'hilo', p_bet, 'active', jsonb_build_object('rank', (v_card->>'r')::int, 'mult', 1))
  returning id into v_round_id;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('round_id', v_round_id, 'card', v_card, 'multiplier', 1, 'new_balance', v_new_balance);
end;
$$;

-- ---- blackjack ------------------------------------------------------------
create or replace function public.casino_bj_start(p_bet numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_player jsonb; v_dealer jsonb; v_pt int; v_dt int;
  v_round_id uuid; v_status text; v_payout numeric := 0; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_bet > 1000000 then raise exception 'Bet is too large.'; end if;

  perform public._casino_void_active(v_uid, 'blackjack');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet
    where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_player := jsonb_build_array(_casino_card(), _casino_card());
  v_dealer := jsonb_build_array(_casino_card(), _casino_card());
  v_pt := _bj_total(v_player); v_dt := _bj_total(v_dealer);

  if v_pt = 21 or v_dt = 21 then
    if v_pt = 21 and v_dt = 21 then v_status := 'push'; v_payout := p_bet;
    elsif v_pt = 21 then v_status := 'blackjack'; v_payout := round(p_bet * 2.5, 2);
    else v_status := 'lost'; v_payout := 0; end if;

    if v_payout > 0 then
      update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
    else select balance into v_new_balance from public.profiles where id = v_uid; end if;

    insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
    values (v_uid, 'blackjack', p_bet, v_payout, case when p_bet > 0 then round(v_payout / p_bet, 4) else 0 end,
            jsonb_build_object('status', v_status, 'player_total', v_pt, 'dealer_total', v_dt));

    return json_build_object('status', v_status, 'done', true, 'player', v_player, 'dealer', v_dealer,
                             'player_total', v_pt, 'dealer_total', v_dt, 'payout', v_payout, 'new_balance', v_new_balance);
  end if;

  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'blackjack', p_bet, 'active', jsonb_build_object('player', v_player, 'dealer', v_dealer))
  returning id into v_round_id;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('status', 'active', 'done', false, 'round_id', v_round_id,
                           'player', v_player, 'dealer', jsonb_build_array(v_dealer->0),
                           'player_total', v_pt, 'can_double', true, 'new_balance', v_new_balance);
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0035.
-- ============================================================================
