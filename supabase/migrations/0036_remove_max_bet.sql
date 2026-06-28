-- ============================================================================
-- EBHS Polymarket — migration 0036: remove the max-bet cap
--
-- Drops the `bet > 1,000,000 → too large` check from every casino game. A bet
-- is now limited only by the player's balance (the `balance >= p_bet` guard
-- stays). Max-WIN safeguards (plinko mult <= 1000, limbo target <= 1,000,000x,
-- etc.) are left intact — this is only about bet SIZE.
--
-- Recreates the four multi-step _start functions on top of 0035 (so the
-- abandoned-round logging is preserved). Run on top of 0001–0035. Re-runnable.
-- ============================================================================

-- ---- DICE ----
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
  v_chance numeric;
  v_mult numeric;
  v_win boolean;
  v_payout numeric := 0;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if v_target is null then raise exception 'Pick a target.'; end if;
  if v_target < 0.01 then v_target := 0.01; end if;
  if v_target > 99.99 then v_target := 99.99; end if;

  v_chance := case when p_over then 100 - v_target else v_target end;
  if v_chance < 0.01 then v_chance := 0.01; end if;
  v_mult := round(99.0 / v_chance, 4);

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_roll := floor(random() * 10001) / 100.0;
  v_win := case when p_over then v_roll > v_target else v_roll < v_target end;

  if v_win then
    v_payout := round(p_bet * v_mult, 2);
    update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'dice', p_bet, v_payout, case when v_win then v_mult else 0 end,
          jsonb_build_object('roll', v_roll, 'target', v_target, 'over', p_over, 'win', v_win));

  return json_build_object('win', v_win, 'roll', v_roll, 'target', v_target, 'over', p_over,
                           'multiplier', v_mult, 'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

-- ---- LIMBO ----
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
  if v_target is null or v_target < 1.01 then raise exception 'Target must be at least 1.01x.'; end if;
  if v_target > 1000000 then v_target := 1000000; end if;  -- max-win safeguard (multiplier, not bet)

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_result := floor((0.99 / (1 - v_r)) * 100) / 100;
  if v_result < 1.00 then v_result := 1.00; end if;
  v_win := v_result >= v_target;

  if v_win then
    v_payout := round(p_bet * v_target, 2);
    update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'limbo', p_bet, v_payout, case when v_win then v_target else 0 end,
          jsonb_build_object('result', v_result, 'target', v_target, 'win', v_win));

  return json_build_object('win', v_win, 'result', v_result, 'target', v_target,
                           'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

-- ---- ROULETTE ----
create or replace function public.casino_roulette(p_bets jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b jsonb;
  v_type text; v_val int; v_amt numeric;
  v_total numeric := 0;
  v_spin int;
  v_payout numeric := 0;
  v_win numeric;
  v_results jsonb := '[]'::jsonb;
  v_new_balance numeric;
  v_red int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bets is null or jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) = 0 then
    raise exception 'Place at least one bet.';
  end if;

  for b in select bet from jsonb_array_elements(p_bets) as e(bet) loop
    v_amt := coalesce((b->>'amount')::numeric, 0);
    if v_amt <= 0 then raise exception 'Each bet must be greater than zero.'; end if;
    v_total := v_total + v_amt;
  end loop;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - v_total where id = v_uid and balance >= v_total;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_spin := floor(random() * 37)::int;

  for b in select bet from jsonb_array_elements(p_bets) as e(bet) loop
    v_type := b->>'type';
    v_val  := coalesce((b->>'value')::int, -1);
    v_amt  := (b->>'amount')::numeric;
    v_win  := 0;
    if v_type = 'number' and v_val = v_spin then v_win := v_amt * 36;
    elsif v_type = 'red'   and v_spin = any(v_red) then v_win := v_amt * 2;
    elsif v_type = 'black' and v_spin <> 0 and not (v_spin = any(v_red)) then v_win := v_amt * 2;
    elsif v_type = 'even'  and v_spin <> 0 and v_spin % 2 = 0 then v_win := v_amt * 2;
    elsif v_type = 'odd'   and v_spin % 2 = 1 then v_win := v_amt * 2;
    elsif v_type = 'low'   and v_spin between 1 and 18 then v_win := v_amt * 2;
    elsif v_type = 'high'  and v_spin between 19 and 36 then v_win := v_amt * 2;
    elsif v_type = 'dozen' and v_spin between (v_val - 1) * 12 + 1 and v_val * 12 then v_win := v_amt * 3;
    elsif v_type = 'column' and v_spin <> 0 and (v_spin % 3) = (v_val % 3) then v_win := v_amt * 3;
    end if;
    v_payout := v_payout + v_win;
    v_results := v_results || jsonb_build_object('type', v_type, 'value', v_val, 'amount', v_amt, 'won', v_win > 0, 'payout', v_win);
  end loop;

  if v_payout > 0 then
    update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'roulette', v_total, v_payout,
          case when v_total > 0 then round(v_payout / v_total, 4) else 0 end,
          jsonb_build_object('spin', v_spin, 'bets', v_results));

  return json_build_object('spin', v_spin, 'total', v_total, 'payout', v_payout,
                           'bets', v_results, 'new_balance', v_new_balance);
end;
$$;

-- ---- BACCARAT ----
create or replace function public.casino_baccarat(p_bet numeric, p_side text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_player jsonb; v_banker jsonb;
  p1 int; p2 int; b1 int; b2 int; p3 int := -1; b3 int := -1;
  v_pt int; v_bt int;
  v_winner text; v_mult numeric := 0; v_payout numeric := 0; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_side not in ('player', 'banker', 'tie') then raise exception 'Pick player, banker or tie.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  p1 := 1 + floor(random()*13)::int; p2 := 1 + floor(random()*13)::int;
  b1 := 1 + floor(random()*13)::int; b2 := 1 + floor(random()*13)::int;
  v_pt := (_bacc_val(p1) + _bacc_val(p2)) % 10;
  v_bt := (_bacc_val(b1) + _bacc_val(b2)) % 10;

  if v_pt < 8 and v_bt < 8 then
    if v_pt <= 5 then
      p3 := 1 + floor(random()*13)::int;
      v_pt := (v_pt + _bacc_val(p3)) % 10;
    end if;

    if p3 = -1 then
      if v_bt <= 5 then b3 := 1 + floor(random()*13)::int; v_bt := (v_bt + _bacc_val(b3)) % 10; end if;
    else
      if v_bt <= 2 then b3 := 1 + floor(random()*13)::int;
      elsif v_bt = 3 and _bacc_val(p3) <> 8 then b3 := 1 + floor(random()*13)::int;
      elsif v_bt = 4 and _bacc_val(p3) between 2 and 7 then b3 := 1 + floor(random()*13)::int;
      elsif v_bt = 5 and _bacc_val(p3) between 4 and 7 then b3 := 1 + floor(random()*13)::int;
      elsif v_bt = 6 and _bacc_val(p3) between 6 and 7 then b3 := 1 + floor(random()*13)::int;
      end if;
      if b3 <> -1 then v_bt := (v_bt + _bacc_val(b3)) % 10; end if;
    end if;
  end if;

  if v_pt > v_bt then v_winner := 'player';
  elsif v_bt > v_pt then v_winner := 'banker';
  else v_winner := 'tie'; end if;

  if p_side = v_winner then
    if p_side = 'player' then v_mult := 2;
    elsif p_side = 'banker' then v_mult := 1.95;
    else v_mult := 9; end if;
  elsif v_winner = 'tie' and p_side in ('player', 'banker') then
    v_mult := 1;
  else
    v_mult := 0;
  end if;

  v_payout := round(p_bet * v_mult, 2);
  if v_payout > 0 then
    update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  v_player := jsonb_build_array(jsonb_build_object('r', p1, 's', floor(random()*4)::int),
                                jsonb_build_object('r', p2, 's', floor(random()*4)::int));
  if p3 <> -1 then v_player := v_player || jsonb_build_object('r', p3, 's', floor(random()*4)::int); end if;
  v_banker := jsonb_build_array(jsonb_build_object('r', b1, 's', floor(random()*4)::int),
                                jsonb_build_object('r', b2, 's', floor(random()*4)::int));
  if b3 <> -1 then v_banker := v_banker || jsonb_build_object('r', b3, 's', floor(random()*4)::int); end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'baccarat', p_bet, v_payout, v_mult,
          jsonb_build_object('side', p_side, 'winner', v_winner, 'player_total', v_pt, 'banker_total', v_bt));

  return json_build_object('side', p_side, 'winner', v_winner, 'player', v_player, 'banker', v_banker,
                           'player_total', v_pt, 'banker_total', v_bt, 'multiplier', v_mult,
                           'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

-- ---- PLINKO ----
create or replace function public.casino_plinko(p_bet numeric, p_rows int, p_risk text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_path jsonb := '[]'::jsonb;
  v_bucket int := 0;
  v_mult numeric;
  v_payout numeric := 0;
  v_new_balance numeric;
  i int;
  v_tables jsonb := '{"low":{"8":[3,2,1.3,0.9,0.6,0.9,1.3,2,3],"9":[3.5,2.3,1.5,1,0.7,0.7,1,1.5,2.3,3.5],"10":[4.3,2.8,1.8,1.2,0.8,0.5,0.8,1.2,1.8,2.8,4.3],"11":[5,3.3,2.2,1.4,0.9,0.6,0.6,0.9,1.4,2.2,3.3,5],"12":[6,4,2.6,1.7,1.1,0.7,0.5,0.7,1.1,1.7,2.6,4,6],"13":[7.1,4.7,3.1,2,1.3,0.9,0.6,0.6,0.9,1.3,2,3.1,4.7,7.1],"14":[8.6,5.6,3.7,2.4,1.6,1.1,0.7,0.5,0.7,1.1,1.6,2.4,3.7,5.6,8.6],"15":[10.1,6.7,4.4,2.9,1.9,1.2,0.8,0.5,0.5,0.8,1.2,1.9,2.9,4.4,6.7,10.1],"16":[12.2,8,5.3,3.5,2.3,1.5,1,0.6,0.4,0.6,1,1.5,2.3,3.5,5.3,8,12.2]},"medium":{"8":[6.2,3,1.5,0.7,0.3,0.7,1.5,3,6.2],"9":[8,3.9,1.9,0.9,0.4,0.4,0.9,1.9,3.9,8],"10":[10.8,5.2,2.6,1.2,0.6,0.3,0.6,1.2,2.6,5.2,10.8],"11":[14.1,6.9,3.3,1.6,0.8,0.4,0.4,0.8,1.6,3.3,6.9,14.1],"12":[19,9.3,4.5,2.2,1.1,0.5,0.3,0.5,1.1,2.2,4.5,9.3,19],"13":[25.1,12.2,5.9,2.9,1.4,0.7,0.3,0.3,0.7,1.4,2.9,5.9,12.2,25.1],"14":[33.7,16.4,8,3.9,1.9,0.9,0.4,0.2,0.4,0.9,1.9,3.9,8,16.4,33.7],"15":[44.6,21.7,10.6,5.1,2.5,1.2,0.6,0.3,0.3,0.6,1.2,2.5,5.1,10.6,21.7,44.6],"16":[60,29.2,14.2,6.9,3.4,1.6,0.8,0.4,0.2,0.4,0.8,1.6,3.4,6.9,14.2,29.2,60]},"high":{"8":[12.1,4.2,1.5,0.5,0.2,0.5,1.5,4.2,12.1],"9":[17.5,6.1,2.1,0.7,0.3,0.3,0.7,2.1,6.1,17.5],"10":[25.9,9.1,3.2,1.1,0.4,0.1,0.4,1.1,3.2,9.1,25.9],"11":[37.8,13.2,4.6,1.6,0.6,0.2,0.2,0.6,1.6,4.6,13.2,37.8],"12":[56,19.6,6.9,2.4,0.8,0.3,0.1,0.3,0.8,2.4,6.9,19.6,56],"13":[81.9,28.7,10,3.5,1.2,0.4,0.2,0.2,0.4,1.2,3.5,10,28.7,81.9],"14":[121,42.5,14.9,5.2,1.8,0.6,0.2,0.1,0.2,0.6,1.8,5.2,14.9,42.5,121],"15":[178,62.4,21.8,7.6,2.7,0.9,0.3,0.1,0.1,0.3,0.9,2.7,7.6,21.8,62.4,178],"16":[264,92.5,32.4,11.3,4,1.4,0.5,0.2,0.1,0.2,0.5,1.4,4,11.3,32.4,92.5,264]}}'::jsonb;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_rows is null or p_rows < 8 or p_rows > 16 then raise exception 'Rows must be between 8 and 16.'; end if;
  if p_risk not in ('low', 'medium', 'high') then raise exception 'Risk must be low, medium or high.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  for i in 1 .. p_rows loop
    if random() < 0.5 then
      v_path := v_path || '0'::jsonb;
    else
      v_path := v_path || '1'::jsonb;
      v_bucket := v_bucket + 1;
    end if;
  end loop;

  v_mult := coalesce((v_tables -> p_risk -> p_rows::text -> v_bucket)::numeric, 0);
  if v_mult > 1000 then v_mult := 1000; end if;

  if v_mult > 0 then
    v_payout := round(p_bet * v_mult, 2);
    update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'plinko', p_bet, v_payout, v_mult,
          jsonb_build_object('rows', p_rows, 'risk', p_risk, 'bucket', v_bucket, 'path', v_path));

  return json_build_object('rows', p_rows, 'risk', p_risk, 'bucket', v_bucket, 'path', v_path,
                           'multiplier', v_mult, 'payout', v_payout, 'win', v_mult >= 1, 'new_balance', v_new_balance);
end;
$$;

-- ---- MINES (start) ----
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
  if p_mines is null or p_mines < 1 or p_mines > 24 then raise exception 'Choose 1 to 24 mines.'; end if;

  perform public._casino_void_active(v_uid, 'mines');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
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

-- ---- CRASH (start) ----
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

  perform public._casino_void_active(v_uid, 'crash');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_crash := floor((0.99 / (1 - v_r)) * 100) / 100;
  if v_crash < 1.00 then v_crash := 1.00; end if;

  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'crash', p_bet, 'active', jsonb_build_object('crash', v_crash))
  returning id, created_at into v_round_id, v_started;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('round_id', v_round_id, 'started_at', v_started, 'new_balance', v_new_balance);
end;
$$;

-- ---- HI-LO (start) ----
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

  perform public._casino_void_active(v_uid, 'hilo');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_card := _casino_card();
  insert into public.casino_rounds (user_id, game, bet, status, secret)
  values (v_uid, 'hilo', p_bet, 'active', jsonb_build_object('rank', (v_card->>'r')::int, 'mult', 1))
  returning id into v_round_id;

  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('round_id', v_round_id, 'card', v_card, 'multiplier', 1, 'new_balance', v_new_balance);
end;
$$;

-- ---- BLACKJACK (start) ----
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

  perform public._casino_void_active(v_uid, 'blackjack');

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet where id = v_uid and balance >= p_bet;
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
-- End of migration 0036.
-- ============================================================================
