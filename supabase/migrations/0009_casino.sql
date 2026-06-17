-- ============================================================================
-- EBHS Polymarket — migration 0009: CASINO
--
-- A Stake-style play-money casino. Adds nine games:
--   Dice, Limbo, Crash, Mines, Keno, Roulette, Blackjack, Baccarat, Hi-Lo.
--
-- Design (identical philosophy to execute_trade / spin_wheel):
--   • ALL randomness + payouts happen server-side in these SECURITY DEFINER
--     functions, so a player can never tamper with an outcome from the browser.
--   • Balance only ever changes behind the app.privileged flag (the
--     profile-protection trigger blocks any direct client edit).
--   • Multi-step games (Mines/Crash/Hi-Lo/Blackjack) keep their hidden state in
--     casino_rounds, which has RLS enabled and NO policies — clients can't read
--     it, only these functions (running as the table owner) can. The functions
--     return just the safe parts.
--   • Completed bets are logged to casino_bets (own rows readable) for history.
--
-- ALL CURRENCY IS FAKE / PLAY MONEY. No real money, crypto or wallets.
-- Paytables are tuned for fun (roughly a ~1–4% house edge); they are not a
-- byte-for-byte copy of any real operator.
--
-- Run in the Supabase SQL editor on top of 0001–0008. Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- Live multi-step game state. Hidden from clients (RLS on, no policies).
create table if not exists public.casino_rounds (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game       text not null,
  bet        numeric not null default 0,
  status     text not null default 'active',   -- active | done
  payout     numeric not null default 0,
  secret     jsonb,                             -- hidden game state
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);
create index if not exists idx_casino_rounds_user on public.casino_rounds (user_id, created_at desc);

-- Completed-bet log (no secrets) for the player's history + "recent" strips.
create table if not exists public.casino_bets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game       text not null,
  bet        numeric not null default 0,
  payout     numeric not null default 0,
  multiplier numeric not null default 0,
  result     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_casino_bets_user on public.casino_bets (user_id, created_at desc);
create index if not exists idx_casino_bets_game on public.casino_bets (game, created_at desc);

alter table public.casino_rounds enable row level security;
alter table public.casino_bets   enable row level security;

-- casino_rounds: no policies => only SECURITY DEFINER functions may touch it.

-- casino_bets: a player can read their own bet log.
drop policy if exists casino_bets_select_own on public.casino_bets;
create policy casino_bets_select_own on public.casino_bets
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Pure helpers (no money; safe to be world-callable)
-- ---------------------------------------------------------------------------

-- A random playing card: rank 1..13 (1=A, 11=J, 12=Q, 13=K), suit 0..3.
-- Infinite-deck model (cards are not removed) — standard for simple clones.
create or replace function public._casino_card()
returns jsonb
language sql
volatile
as $$
  select jsonb_build_object('r', 1 + floor(random() * 13)::int, 's', floor(random() * 4)::int);
$$;

-- Best blackjack total for a hand (aces count 11 then drop to 1 as needed).
create or replace function public._bj_total(p_cards jsonb)
returns int
language plpgsql
immutable
as $$
declare c jsonb; r int; t int := 0; aces int := 0;
begin
  for c in select card from jsonb_array_elements(p_cards) as e(card) loop
    r := (c->>'r')::int;
    if r >= 10 then t := t + 10;
    elsif r = 1 then t := t + 11; aces := aces + 1;
    else t := t + r;
    end if;
  end loop;
  while t > 21 and aces > 0 loop
    t := t - 10; aces := aces - 1;
  end loop;
  return t;
end;
$$;

-- Baccarat point value of a card (A=1, 2-9 face, 10/J/Q/K=0).
create or replace function public._bacc_val(p_rank int)
returns int
language sql
immutable
as $$ select case when p_rank >= 10 then 0 else p_rank end; $$;

-- ---------------------------------------------------------------------------
-- 3. Instant games
-- ---------------------------------------------------------------------------

-- DICE — roll 0.00..100.00; bet the roll is over/under a target.
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

-- LIMBO — a random multiplier is generated; you win your target if it's >= target.
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
  if v_target > 1000000 then v_target := 1000000; end if;

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

-- KENO — pick 1..10 numbers from 1..40; 10 are drawn; payout by hit count.
create or replace function public.casino_keno(p_bet numeric, p_picks int[])
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_spots int := coalesce(array_length(p_picks, 1), 0);
  v_draw int[];
  v_hits int;
  v_mult numeric;
  v_payout numeric := 0;
  v_new_balance numeric;
  v_table jsonb := '{
    "1":[0,3.8],
    "2":[0,1.7,5.2],
    "3":[0,1,3.1,10.4],
    "4":[0,0,2.2,7.9,90],
    "5":[0,0,1.5,4.2,13,300],
    "6":[0,0,1.1,2,6.2,100,700],
    "7":[0,0,1.1,1.6,3.5,15,225,700],
    "8":[0,0,1.1,1.5,2,5.5,39,100,800],
    "9":[0,0,1.1,1.3,1.7,2.5,7.5,50,250,1000],
    "10":[0,0,1.1,1.3,1.6,2,5,15,50,200,1000]
  }'::jsonb;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_bet is null or p_bet <= 0 then raise exception 'Bet must be greater than zero.'; end if;
  if p_bet > 1000000 then raise exception 'Bet is too large.'; end if;
  if v_spots < 1 or v_spots > 10 then raise exception 'Pick between 1 and 10 numbers.'; end if;
  if (select count(distinct x) from unnest(p_picks) x) <> v_spots then
    raise exception 'Picks must be distinct.';
  end if;
  if exists (select 1 from unnest(p_picks) x where x < 1 or x > 40) then
    raise exception 'Numbers must be between 1 and 40.';
  end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet
    where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_draw := array(select g from generate_series(1, 40) g order by random() limit 10);
  v_hits := (select count(*) from unnest(p_picks) pk where pk = any (v_draw));
  v_mult := coalesce((v_table -> v_spots::text ->> v_hits)::numeric, 0);

  if v_mult > 0 then
    v_payout := round(p_bet * v_mult, 2);
    update public.profiles set balance = balance + v_payout where id = v_uid
      returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'keno', p_bet, v_payout, v_mult,
          jsonb_build_object('picks', p_picks, 'draw', v_draw, 'hits', v_hits));

  return json_build_object(
    'picks', p_picks, 'draw', v_draw, 'hits', v_hits,
    'multiplier', v_mult, 'payout', v_payout, 'new_balance', v_new_balance
  );
end;
$$;

-- ROULETTE — European single-zero wheel. p_bets: [{type,value,amount}]
-- types: number(0-36), red, black, even, odd, low, high, dozen(1-3), column(1-3)
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
  if v_total > 1000000 then raise exception 'Bet is too large.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - v_total
    where id = v_uid and balance >= v_total;
  if not found then raise exception 'Insufficient balance.'; end if;

  v_spin := floor(random() * 37)::int;   -- 0..36

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
    update public.profiles set balance = balance + v_payout where id = v_uid
      returning balance into v_new_balance;
  else
    select balance into v_new_balance from public.profiles where id = v_uid;
  end if;

  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'roulette', v_total, v_payout,
          case when v_total > 0 then round(v_payout / v_total, 4) else 0 end,
          jsonb_build_object('spin', v_spin, 'bets', v_results));

  return json_build_object(
    'spin', v_spin, 'total', v_total, 'payout', v_payout,
    'bets', v_results, 'new_balance', v_new_balance
  );
end;
$$;

-- BACCARAT — bet player / banker / tie. Standard third-card rules.
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
  if p_bet > 1000000 then raise exception 'Bet is too large.'; end if;
  if p_side not in ('player', 'banker', 'tie') then raise exception 'Pick player, banker or tie.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance - p_bet
    where id = v_uid and balance >= p_bet;
  if not found then raise exception 'Insufficient balance.'; end if;

  p1 := 1 + floor(random()*13)::int; p2 := 1 + floor(random()*13)::int;
  b1 := 1 + floor(random()*13)::int; b2 := 1 + floor(random()*13)::int;
  v_pt := (_bacc_val(p1) + _bacc_val(p2)) % 10;
  v_bt := (_bacc_val(b1) + _bacc_val(b2)) % 10;

  -- no draws on a natural 8 or 9
  if v_pt < 8 and v_bt < 8 then
    if v_pt <= 5 then
      p3 := 1 + floor(random()*13)::int;
      v_pt := (v_pt + _bacc_val(p3)) % 10;
    end if;

    if p3 = -1 then
      -- player stood: banker draws on 0-5
      if v_bt <= 5 then b3 := 1 + floor(random()*13)::int; v_bt := (v_bt + _bacc_val(b3)) % 10; end if;
    else
      -- banker draws per the player's third card
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

  -- payouts: player 1:1, banker 0.95:1 (commission), tie 8:1; on a tie the
  -- player/banker bets push (stake returned).
  if p_side = v_winner then
    if p_side = 'player' then v_mult := 2;
    elsif p_side = 'banker' then v_mult := 1.95;
    else v_mult := 9; end if;
  elsif v_winner = 'tie' and p_side in ('player', 'banker') then
    v_mult := 1;  -- push
  else
    v_mult := 0;
  end if;

  v_payout := round(p_bet * v_mult, 2);
  if v_payout > 0 then
    update public.profiles set balance = balance + v_payout where id = v_uid
      returning balance into v_new_balance;
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

  return json_build_object(
    'side', p_side, 'winner', v_winner, 'player', v_player, 'banker', v_banker,
    'player_total', v_pt, 'banker_total', v_bt, 'multiplier', v_mult,
    'payout', v_payout, 'new_balance', v_new_balance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Mines (multi-step)
-- ---------------------------------------------------------------------------
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

  if exists (select 1 from public.casino_rounds where user_id = v_uid and game = 'mines' and status = 'active') then
    update public.casino_rounds set status = 'done', ended_at = now()
      where user_id = v_uid and game = 'mines' and status = 'active';
  end if;

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

-- internal: multiplier after revealing k safe tiles with m mines (1% edge)
create or replace function public._mines_mult(p_count int, p_revealed int)
returns numeric
language plpgsql
immutable
as $$
declare i int; v numeric := 0.99;
begin
  if p_revealed <= 0 then return 1; end if;
  for i in 0 .. p_revealed - 1 loop
    v := v * (25 - i)::numeric / (25 - p_count - i)::numeric;
  end loop;
  return round(v, 4);
end;
$$;

create or replace function public.casino_mines_reveal(p_round uuid, p_tile int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_mines int[]; v_count int; v_revealed jsonb; v_revcount int;
  v_mult numeric; v_next numeric; v_payout numeric := 0; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_tile is null or p_tile < 0 or p_tile > 24 then raise exception 'Bad tile.'; end if;

  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'mines' and status = 'active' for update;
  if not found then raise exception 'No active mines game.'; end if;

  v_mines := array(select jsonb_array_elements_text(r.secret->'mines'))::int[];
  v_count := (r.secret->>'count')::int;
  v_revealed := r.secret->'revealed';

  if v_revealed @> to_jsonb(p_tile) then raise exception 'Tile already revealed.'; end if;

  perform set_config('app.privileged', 'on', true);

  if p_tile = any (v_mines) then
    update public.casino_rounds set status = 'done', ended_at = now(),
      secret = jsonb_set(r.secret, '{revealed}', v_revealed || to_jsonb(p_tile))
      where id = p_round;
    insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
    values (v_uid, 'mines', r.bet, 0, 0, jsonb_build_object('mines', v_mines, 'hit', p_tile, 'win', false));
    select balance into v_new_balance from public.profiles where id = v_uid;
    return json_build_object('status', 'lost', 'hit', p_tile, 'mines', v_mines, 'new_balance', v_new_balance);
  end if;

  v_revealed := v_revealed || to_jsonb(p_tile);
  v_revcount := jsonb_array_length(v_revealed);
  v_mult := _mines_mult(v_count, v_revcount);

  -- cleared the whole board => auto cash-out
  if v_revcount >= 25 - v_count then
    v_payout := round(r.bet * v_mult, 2);
    update public.profiles set balance = balance + v_payout where id = v_uid
      returning balance into v_new_balance;
    update public.casino_rounds set status = 'done', payout = v_payout, ended_at = now(),
      secret = jsonb_set(r.secret, '{revealed}', v_revealed) where id = p_round;
    insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
    values (v_uid, 'mines', r.bet, v_payout, v_mult, jsonb_build_object('cleared', true, 'win', true));
    return json_build_object('status', 'cashed', 'tile', p_tile, 'multiplier', v_mult,
                             'payout', v_payout, 'mines', v_mines, 'new_balance', v_new_balance);
  end if;

  v_next := _mines_mult(v_count, v_revcount + 1);
  update public.casino_rounds set secret = jsonb_set(r.secret, '{revealed}', v_revealed) where id = p_round;
  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('status', 'safe', 'tile', p_tile, 'revealed', v_revcount,
                           'multiplier', v_mult, 'next_multiplier', v_next, 'new_balance', v_new_balance);
end;
$$;

create or replace function public.casino_mines_cashout(p_round uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_count int; v_revcount int; v_mult numeric; v_payout numeric; v_new_balance numeric; v_mines int[];
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'mines' and status = 'active' for update;
  if not found then raise exception 'No active mines game.'; end if;

  v_count := (r.secret->>'count')::int;
  v_revcount := jsonb_array_length(r.secret->'revealed');
  if v_revcount = 0 then raise exception 'Reveal at least one tile first.'; end if;
  v_mult := _mines_mult(v_count, v_revcount);
  v_mines := array(select jsonb_array_elements_text(r.secret->'mines'))::int[];

  perform set_config('app.privileged', 'on', true);
  v_payout := round(r.bet * v_mult, 2);
  update public.profiles set balance = balance + v_payout where id = v_uid
    returning balance into v_new_balance;
  update public.casino_rounds set status = 'done', payout = v_payout, ended_at = now() where id = p_round;
  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'mines', r.bet, v_payout, v_mult, jsonb_build_object('win', true, 'revealed', v_revcount));

  return json_build_object('status', 'cashed', 'multiplier', v_mult, 'payout', v_payout,
                           'mines', v_mines, 'new_balance', v_new_balance);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Crash (multi-step, time-based). Growth: multiplier = exp(0.06 * seconds).
--    The crash point is hidden; cash-out is validated against server elapsed
--    time, so knowing nothing, the player must cash before it busts.
-- ---------------------------------------------------------------------------
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

  update public.casino_rounds set status = 'done', ended_at = now()
    where user_id = v_uid and game = 'crash' and status = 'active';

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

-- ---------------------------------------------------------------------------
-- 6. Hi-Lo (multi-step). Higher-or-same / lower-or-same against a full 52 deck.
-- ---------------------------------------------------------------------------
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

  update public.casino_rounds set status = 'done', ended_at = now()
    where user_id = v_uid and game = 'hilo' and status = 'active';

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

create or replace function public.casino_hilo_guess(p_round uuid, p_dir text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_cur int; v_next jsonb; v_nrank int; v_mult numeric; v_step numeric; v_chance numeric;
  v_win boolean; v_payout numeric := 0; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_dir not in ('hi', 'lo') then raise exception 'Guess hi or lo.'; end if;

  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'hilo' and status = 'active' for update;
  if not found then raise exception 'No active hi-lo game.'; end if;

  v_cur := (r.secret->>'rank')::int;
  v_mult := (r.secret->>'mult')::numeric;

  -- chance for the chosen direction (≥ for hi, ≤ for lo), full 52-card deck
  if p_dir = 'hi' then v_chance := (14 - v_cur) * 4.0 / 52.0;
  else v_chance := v_cur * 4.0 / 52.0; end if;
  v_step := round(0.99 / v_chance, 4);

  v_next := _casino_card();
  v_nrank := (v_next->>'r')::int;
  v_win := case when p_dir = 'hi' then v_nrank >= v_cur else v_nrank <= v_cur end;

  perform set_config('app.privileged', 'on', true);

  if not v_win then
    update public.casino_rounds set status = 'done', ended_at = now() where id = p_round;
    insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
    values (v_uid, 'hilo', r.bet, 0, 0, jsonb_build_object('win', false));
    select balance into v_new_balance from public.profiles where id = v_uid;
    return json_build_object('status', 'lost', 'card', v_next, 'new_balance', v_new_balance);
  end if;

  v_mult := round(v_mult * v_step, 4);
  update public.casino_rounds set
    secret = jsonb_build_object('rank', v_nrank, 'mult', v_mult) where id = p_round;
  select balance into v_new_balance from public.profiles where id = v_uid;
  return json_build_object('status', 'safe', 'card', v_next, 'multiplier', v_mult,
                           'potential', round(r.bet * v_mult, 2), 'new_balance', v_new_balance);
end;
$$;

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

-- ---------------------------------------------------------------------------
-- 7. Blackjack (multi-step). Infinite deck, dealer stands on 17, BJ pays 3:2,
--    double on first move. (No split / insurance.)
-- ---------------------------------------------------------------------------
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

  update public.casino_rounds set status = 'done', ended_at = now()
    where user_id = v_uid and game = 'blackjack' and status = 'active';

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

create or replace function public.casino_bj_action(p_round uuid, p_action text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.casino_rounds%rowtype;
  v_uid uuid := auth.uid();
  v_player jsonb; v_dealer jsonb; v_bet numeric; v_extra numeric := 0;
  v_pt int; v_dt int; v_status text; v_payout numeric := 0; v_new_balance numeric; v_doubled boolean := false;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  if p_action not in ('hit', 'stand', 'double') then raise exception 'Bad action.'; end if;

  select * into r from public.casino_rounds
    where id = p_round and user_id = v_uid and game = 'blackjack' and status = 'active' for update;
  if not found then raise exception 'No active blackjack game.'; end if;

  v_player := r.secret->'player'; v_dealer := r.secret->'dealer'; v_bet := r.bet;
  perform set_config('app.privileged', 'on', true);

  if p_action = 'double' then
    if jsonb_array_length(v_player) <> 2 then raise exception 'You can only double on your first move.'; end if;
    update public.profiles set balance = balance - v_bet where id = v_uid and balance >= v_bet;
    if not found then raise exception 'Insufficient balance to double.'; end if;
    v_extra := v_bet; v_doubled := true;
    v_player := v_player || _casino_card();
  elsif p_action = 'hit' then
    v_player := v_player || _casino_card();
  end if;

  v_pt := _bj_total(v_player);

  -- a plain hit that doesn't bust keeps the player's turn going
  if p_action = 'hit' and v_pt <= 21 then
    update public.casino_rounds set secret = jsonb_set(r.secret, '{player}', v_player) where id = p_round;
    select balance into v_new_balance from public.profiles where id = v_uid;
    return json_build_object('status', 'active', 'done', false, 'round_id', p_round,
                             'player', v_player, 'dealer', jsonb_build_array(v_dealer->0),
                             'player_total', v_pt, 'can_double', false, 'new_balance', v_new_balance);
  end if;

  -- otherwise we settle: dealer draws to 17 (only if the player hasn't busted)
  if v_pt <= 21 then
    v_dt := _bj_total(v_dealer);
    while v_dt < 17 loop
      v_dealer := v_dealer || _casino_card();
      v_dt := _bj_total(v_dealer);
    end loop;
  else
    v_dt := _bj_total(v_dealer);
  end if;

  if v_pt > 21 then v_status := 'lost';
  elsif v_dt > 21 then v_status := 'won';
  elsif v_pt > v_dt then v_status := 'won';
  elsif v_pt < v_dt then v_status := 'lost';
  else v_status := 'push'; end if;

  if v_status = 'won' then v_payout := round((v_bet + v_extra) * 2, 2);
  elsif v_status = 'push' then v_payout := v_bet + v_extra;
  else v_payout := 0; end if;

  if v_payout > 0 then
    update public.profiles set balance = balance + v_payout where id = v_uid returning balance into v_new_balance;
  else select balance into v_new_balance from public.profiles where id = v_uid; end if;

  update public.casino_rounds set status = 'done', payout = v_payout, ended_at = now(),
    secret = jsonb_set(jsonb_set(r.secret, '{player}', v_player), '{dealer}', v_dealer) where id = p_round;
  insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
  values (v_uid, 'blackjack', v_bet + v_extra, v_payout,
          case when (v_bet + v_extra) > 0 then round(v_payout / (v_bet + v_extra), 4) else 0 end,
          jsonb_build_object('status', v_status, 'player_total', v_pt, 'dealer_total', v_dt, 'doubled', v_doubled));

  return json_build_object('status', v_status, 'done', true, 'round_id', p_round,
                           'player', v_player, 'dealer', v_dealer, 'player_total', v_pt, 'dealer_total', v_dt,
                           'doubled', v_doubled, 'payout', v_payout, 'new_balance', v_new_balance);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants — expose the player entrypoints as PostgREST RPCs.
-- ---------------------------------------------------------------------------
grant select on public.casino_bets to authenticated;

grant execute on function public.casino_dice(numeric, numeric, boolean)   to authenticated;
grant execute on function public.casino_limbo(numeric, numeric)           to authenticated;
grant execute on function public.casino_keno(numeric, int[])              to authenticated;
grant execute on function public.casino_roulette(jsonb)                   to authenticated;
grant execute on function public.casino_baccarat(numeric, text)           to authenticated;
grant execute on function public.casino_mines_start(numeric, int)         to authenticated;
grant execute on function public.casino_mines_reveal(uuid, int)           to authenticated;
grant execute on function public.casino_mines_cashout(uuid)               to authenticated;
grant execute on function public.casino_crash_start(numeric)              to authenticated;
grant execute on function public.casino_crash_cashout(uuid, numeric)      to authenticated;
grant execute on function public.casino_hilo_start(numeric)               to authenticated;
grant execute on function public.casino_hilo_guess(uuid, text)            to authenticated;
grant execute on function public.casino_hilo_cashout(uuid)                to authenticated;
grant execute on function public.casino_bj_start(numeric)                 to authenticated;
grant execute on function public.casino_bj_action(uuid, text)             to authenticated;

-- ============================================================================
-- End of migration 0009.
-- ============================================================================
