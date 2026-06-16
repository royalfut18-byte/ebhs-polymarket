-- ============================================================================
-- EBHS Polymarket — full database schema, RLS, triggers and RPC functions.
--
-- This single migration creates everything:
--   • enums + tables (profiles, markets, positions, trades, comments)
--   • the new-user trigger (auto-creates a profile with 1000 play credits)
--   • the profile-protection trigger (users can't edit their own role/balance)
--   • Row Level Security policies
--   • the LMSR pricing helpers + buy/sell/resolve/admin RPC functions
--   • a leaderboard view (net worth = balance + mark-to-market positions)
--
-- It is written to be safely re-runnable (idempotent) on a fresh Supabase DB.
-- Run it in the Supabase SQL editor, or via the Supabase CLI.
--
-- ALL CURRENCY HERE IS FAKE / PLAY MONEY. There is no real money, crypto, or
-- wallet anywhere in this system.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('admin', 'subadmin', 'user');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'market_status') then
    create type market_status as enum ('open', 'closed', 'resolved', 'cancelled');
  end if;
end $$;

-- A single yes/no enum is reused for: position outcome, trade outcome and the
-- market's resolution. Using one type means we can compare them directly.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'outcome_type') then
    create type outcome_type as enum ('yes', 'no');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'trade_side') then
    create type trade_side as enum ('buy', 'sell');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- profiles: one row per auth user (created automatically by a trigger).
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  display_name text not null default '',
  role         user_role not null default 'user',
  balance      numeric not null default 1000,            -- FAKE play credits
  created_at   timestamptz not null default now()
);

-- markets: each question. LMSR state lives in b / q_yes / q_no.
create table if not exists public.markets (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  description  text not null default '',
  category     text not null default 'Random',
  image_url    text,                                     -- image URL or emoji
  created_by   uuid references public.profiles(id) on delete set null,
  status       market_status not null default 'open',
  resolution   outcome_type,                             -- null until resolved
  b            numeric not null default 100,             -- LMSR liquidity param
  q_yes        numeric not null default 0,               -- LMSR yes quantity
  q_no         numeric not null default 0,               -- LMSR no quantity
  initial_prob numeric not null default 0.5,             -- starting YES prob
  close_at     timestamptz,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- positions: a user's current holding of an outcome in a market.
create table if not exists public.positions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  market_id  uuid not null references public.markets(id) on delete cascade,
  outcome    outcome_type not null,
  shares     numeric not null default 0,
  avg_price  numeric not null default 0,                 -- weighted avg buy price (0-1)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, market_id, outcome)
);

-- trades: every buy/sell. price_before / price_after are the YES probability
-- (0-1) before and after the trade, used to draw the price chart + activity feed.
create table if not exists public.trades (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  market_id    uuid not null references public.markets(id) on delete cascade,
  outcome      outcome_type not null,
  side         trade_side not null,
  shares       numeric not null,
  cost         numeric not null,                         -- credits paid (buy) / received (sell)
  price_before numeric not null,                         -- YES prob before
  price_after  numeric not null,                         -- YES prob after
  created_at   timestamptz not null default now()
);

-- comments (optional social layer)
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  market_id  uuid not null references public.markets(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trades_market_created on public.trades (market_id, created_at);
create index if not exists idx_positions_user on public.positions (user_id);
create index if not exists idx_positions_market on public.positions (market_id);
create index if not exists idx_markets_status on public.markets (status);
create index if not exists idx_markets_category on public.markets (category);
create index if not exists idx_comments_market on public.comments (market_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. New-user trigger: auto-create a profile with 1000 play credits
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, role, balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'username',
      split_part(new.email, '@', 1)
    ),
    'user',
    1000
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Profile-protection trigger
--    Users may edit their own display_name, but NEVER their role, balance,
--    username or id directly. Privileged RPC functions set a transaction-local
--    flag (app.privileged='on') so they alone may change those columns.
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  -- Allow the change when:
  --   • a privileged RPC has flagged this transaction (app.privileged = 'on'), or
  --   • the DB role is privileged: SECURITY DEFINER functions run as the table
  --     owner ('postgres'), and the seed script / server tasks use 'service_role'.
  -- Otherwise this is a direct edit by an end user ('authenticated'/'anon'),
  -- who may change only their display_name.
  if current_setting('app.privileged', true) is distinct from 'on'
     and current_user not in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
  then
    if new.role     is distinct from old.role     then raise exception 'You cannot change your role.'; end if;
    if new.balance  is distinct from old.balance  then raise exception 'You cannot change your balance.'; end if;
    if new.username is distinct from old.username then raise exception 'You cannot change your username.'; end if;
    if new.id       is distinct from old.id       then raise exception 'You cannot change your id.'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- 5. LMSR pricing helpers (numerically stable)
--    Cost:   C(qy, qn) = b * ln( e^(qy/b) + e^(qn/b) )
--    PriceY: P_yes     = e^(qy/b) / ( e^(qy/b) + e^(qn/b) )
-- ---------------------------------------------------------------------------

-- Stable YES price via a sigmoid; P_no is simply 1 - P_yes.
create or replace function public.lmsr_price_yes(q_yes numeric, q_no numeric, b numeric)
returns double precision
language plpgsql
immutable
as $$
declare z double precision;
begin
  if b is null or b <= 0 then return 0.5; end if;
  z := (q_no::double precision - q_yes::double precision) / b::double precision;
  -- clamp to avoid exp() overflow at the extremes (price stays within ~4e-18 of 0/1)
  if z >  40 then z :=  40; end if;
  if z < -40 then z := -40; end if;
  return 1.0 / (1.0 + exp(z));
end;
$$;

-- Stable cost function using the log-sum-exp trick.
create or replace function public.lmsr_cost(q_yes numeric, q_no numeric, b numeric)
returns double precision
language plpgsql
immutable
as $$
declare qy double precision; qn double precision; bb double precision; m double precision;
begin
  qy := q_yes::double precision; qn := q_no::double precision; bb := b::double precision;
  if bb <= 0 then return 0; end if;
  m := greatest(qy, qn);
  return m + bb * ln( exp((qy - m) / bb) + exp((qn - m) / bb) );
end;
$$;

-- The caller's role (null if not logged in). SECURITY DEFINER so role checks
-- inside other functions are reliable.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 6. quote_trade — read-only price preview (used by the trade panel)
--    p_value: BUY -> credits to spend; SELL -> number of shares to sell.
-- ---------------------------------------------------------------------------
create or replace function public.quote_trade(
  p_market_id uuid,
  p_outcome   text,
  p_side      text,
  p_value     numeric
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.markets%rowtype;
  v_b double precision; v_qy double precision; v_qn double precision;
  v_c0 double precision; v_target double precision;
  v_cost double precision; v_shares double precision; v_proceeds double precision;
  v_new_qy double precision; v_new_qn double precision;
  v_price_before double precision; v_price_after double precision; v_avg double precision;
begin
  if p_outcome not in ('yes', 'no') then raise exception 'Invalid outcome.'; end if;
  if p_side    not in ('buy', 'sell') then raise exception 'Invalid side.'; end if;

  select * into m from public.markets where id = p_market_id;
  if not found then raise exception 'Market not found.'; end if;

  v_b := m.b; v_qy := m.q_yes; v_qn := m.q_no;
  v_price_before := public.lmsr_price_yes(m.q_yes, m.q_no, m.b);
  v_c0 := public.lmsr_cost(m.q_yes, m.q_no, m.b);

  if p_value is null or p_value <= 0 then
    return json_build_object(
      'shares', 0, 'cost', 0, 'proceeds', 0, 'avg_price', v_price_before,
      'price_before', v_price_before, 'price_after', v_price_before, 'potential_payout', 0
    );
  end if;

  if p_side = 'buy' then
    v_cost := p_value;
    v_target := v_c0 + v_cost;
    if p_outcome = 'yes' then
      v_new_qy := v_target + v_b * ln(1 - exp((v_qn - v_target) / v_b));
      v_new_qn := v_qn;
      v_shares := v_new_qy - v_qy;
    else
      v_new_qn := v_target + v_b * ln(1 - exp((v_qy - v_target) / v_b));
      v_new_qy := v_qy;
      v_shares := v_new_qn - v_qn;
    end if;
    v_avg := v_cost / v_shares;
    v_price_after := public.lmsr_price_yes(v_new_qy::numeric, v_new_qn::numeric, m.b);
    return json_build_object(
      'shares', v_shares, 'cost', v_cost, 'proceeds', 0, 'avg_price', v_avg,
      'price_before', v_price_before, 'price_after', v_price_after, 'potential_payout', v_shares
    );
  else
    v_shares := p_value;
    if p_outcome = 'yes' then v_new_qy := v_qy - v_shares; v_new_qn := v_qn;
    else                      v_new_qn := v_qn - v_shares; v_new_qy := v_qy; end if;
    v_proceeds := v_c0 - public.lmsr_cost(v_new_qy::numeric, v_new_qn::numeric, m.b);
    if v_proceeds < 0 then v_proceeds := 0; end if;
    v_avg := v_proceeds / v_shares;
    v_price_after := public.lmsr_price_yes(v_new_qy::numeric, v_new_qn::numeric, m.b);
    return json_build_object(
      'shares', v_shares, 'cost', 0, 'proceeds', v_proceeds, 'avg_price', v_avg,
      'price_before', v_price_before, 'price_after', v_price_after, 'potential_payout', 0
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. execute_trade — the real buy/sell, in a single transaction.
--    Locks the market + profile rows, validates, mutates balance/positions,
--    and records a trade. This is the ONLY way money/positions ever change.
-- ---------------------------------------------------------------------------
create or replace function public.execute_trade(
  p_market_id uuid,
  p_outcome   text,
  p_side      text,
  p_value     numeric  -- BUY: credits to spend; SELL: shares to sell
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.markets%rowtype;
  v_b double precision; v_qy double precision; v_qn double precision;
  v_c0 double precision; v_target double precision;
  v_cost double precision; v_shares double precision; v_proceeds double precision := 0;
  v_new_qy double precision; v_new_qn double precision;
  v_price_before double precision; v_price_after double precision; v_avg double precision;
  v_balance numeric; v_pos_shares numeric; v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in to trade.'; end if;
  if p_outcome not in ('yes', 'no') then raise exception 'Invalid outcome.'; end if;
  if p_side    not in ('buy', 'sell') then raise exception 'Invalid side.'; end if;
  if p_value is null or p_value <= 0 then raise exception 'Amount must be greater than zero.'; end if;

  select * into m from public.markets where id = p_market_id for update;
  if not found then raise exception 'Market not found.'; end if;
  if m.status <> 'open' then raise exception 'This market is not open for trading.'; end if;

  v_b := m.b; v_qy := m.q_yes; v_qn := m.q_no;
  v_price_before := public.lmsr_price_yes(m.q_yes, m.q_no, m.b);
  v_c0 := public.lmsr_cost(m.q_yes, m.q_no, m.b);

  -- allow the balance update past the profile-protection trigger
  perform set_config('app.privileged', 'on', true);

  if p_side = 'buy' then
    v_cost := p_value;
    v_target := v_c0 + v_cost;
    if p_outcome = 'yes' then
      v_new_qy := v_target + v_b * ln(1 - exp((v_qn - v_target) / v_b));
      v_new_qn := v_qn;
      v_shares := v_new_qy - v_qy;
    else
      v_new_qn := v_target + v_b * ln(1 - exp((v_qy - v_target) / v_b));
      v_new_qy := v_qy;
      v_shares := v_new_qn - v_qn;
    end if;

    if v_shares <= 0 then raise exception 'Trade too small.'; end if;

    select balance into v_balance from public.profiles where id = v_uid for update;
    if v_balance < p_value then
      raise exception 'Insufficient balance. You have % credits.', round(v_balance, 2);
    end if;

    v_avg := v_cost / v_shares;

    update public.markets set q_yes = v_new_qy, q_no = v_new_qn where id = p_market_id;
    update public.profiles set balance = balance - p_value where id = v_uid
      returning balance into v_new_balance;

    insert into public.positions (user_id, market_id, outcome, shares, avg_price)
    values (v_uid, p_market_id, p_outcome::outcome_type, v_shares::numeric, v_avg::numeric)
    on conflict (user_id, market_id, outcome) do update set
      avg_price  = ((positions.shares * positions.avg_price) + p_value) / (positions.shares + v_shares::numeric),
      shares     = positions.shares + v_shares::numeric,
      updated_at = now();

  else -- SELL
    v_shares := p_value; -- number of shares to sell
    select shares into v_pos_shares from public.positions
      where user_id = v_uid and market_id = p_market_id and outcome = p_outcome::outcome_type
      for update;
    if v_pos_shares is null or v_pos_shares < p_value then
      raise exception 'You do not have enough shares to sell.';
    end if;

    if p_outcome = 'yes' then v_new_qy := v_qy - v_shares; v_new_qn := v_qn;
    else                      v_new_qn := v_qn - v_shares; v_new_qy := v_qy; end if;

    v_proceeds := v_c0 - public.lmsr_cost(v_new_qy::numeric, v_new_qn::numeric, m.b);
    if v_proceeds < 0 then v_proceeds := 0; end if;
    v_avg := v_proceeds / v_shares;

    update public.markets set q_yes = v_new_qy, q_no = v_new_qn where id = p_market_id;
    update public.profiles set balance = balance + v_proceeds::numeric where id = v_uid
      returning balance into v_new_balance;

    update public.positions set shares = shares - p_value, updated_at = now()
      where user_id = v_uid and market_id = p_market_id and outcome = p_outcome::outcome_type;
    delete from public.positions
      where user_id = v_uid and market_id = p_market_id and outcome = p_outcome::outcome_type
        and shares <= 0.0000001;
  end if;

  v_price_after := public.lmsr_price_yes(v_new_qy::numeric, v_new_qn::numeric, m.b);

  insert into public.trades (user_id, market_id, outcome, side, shares, cost, price_before, price_after)
  values (
    v_uid, p_market_id, p_outcome::outcome_type, p_side::trade_side,
    (case when p_side = 'buy' then v_shares else p_value::double precision end)::numeric,
    (case when p_side = 'buy' then v_cost  else v_proceeds end)::numeric,
    v_price_before::numeric, v_price_after::numeric
  );

  return json_build_object(
    'side', p_side,
    'outcome', p_outcome,
    'shares', (case when p_side = 'buy' then v_shares else p_value::double precision end),
    'cost', (case when p_side = 'buy' then v_cost else v_proceeds end),
    'avg_price', v_avg,
    'price_before', v_price_before,
    'price_after', v_price_after,
    'new_balance', v_new_balance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Admin / sub-admin market management
-- ---------------------------------------------------------------------------

-- create_market: initialise the LMSR curve from a starting YES probability.
--   q_no = 0,  q_yes = b * ln( p / (1 - p) )   =>   P_yes = p
create or replace function public.create_market(
  p_question    text,
  p_description  text,
  p_category     text,
  p_image_url    text,
  p_initial_prob numeric,
  p_b            numeric,
  p_close_at     timestamptz
)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_p double precision;
  v_qyes double precision;
  m public.markets;
begin
  if v_role not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can create markets.';
  end if;
  if p_question is null or length(trim(p_question)) = 0 then
    raise exception 'Question is required.';
  end if;

  v_p := coalesce(p_initial_prob, 0.5);
  if v_p < 0.01 then v_p := 0.01; end if;
  if v_p > 0.99 then v_p := 0.99; end if;
  if p_b is null or p_b <= 0 then p_b := 100; end if;

  v_qyes := p_b::double precision * ln(v_p / (1 - v_p));

  insert into public.markets
    (question, description, category, image_url, created_by, status, b, q_yes, q_no, initial_prob, close_at)
  values
    (trim(p_question), coalesce(p_description, ''),
     coalesce(nullif(trim(p_category), ''), 'Random'), p_image_url,
     auth.uid(), 'open', p_b, v_qyes, 0, v_p, p_close_at)
  returning * into m;

  return m;
end;
$$;

-- update_market: edit metadata only (never the live LMSR state).
create or replace function public.update_market(
  p_market_id  uuid,
  p_question   text,
  p_description text,
  p_category   text,
  p_image_url  text,
  p_close_at   timestamptz
)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare v_role text := public.current_user_role(); m public.markets;
begin
  if v_role not in ('admin', 'subadmin') then raise exception 'Not authorized.'; end if;
  update public.markets set
    question    = coalesce(nullif(trim(p_question), ''), question),
    description = coalesce(p_description, description),
    category    = coalesce(nullif(trim(p_category), ''), category),
    image_url   = coalesce(p_image_url, image_url),
    close_at    = p_close_at
  where id = p_market_id
  returning * into m;
  if not found then raise exception 'Market not found.'; end if;
  return m;
end;
$$;

-- set_market_status: open <-> closed (pausing trading). Use resolve/cancel
-- for terminal states.
create or replace function public.set_market_status(p_market_id uuid, p_status text)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare v_role text := public.current_user_role(); m public.markets;
begin
  if v_role not in ('admin', 'subadmin') then raise exception 'Not authorized.'; end if;
  if p_status not in ('open', 'closed') then
    raise exception 'Use resolve or cancel for that status.';
  end if;
  update public.markets set status = p_status::market_status
    where id = p_market_id and status in ('open', 'closed')
    returning * into m;
  if not found then raise exception 'Market not found, or it is already settled.'; end if;
  return m;
end;
$$;

-- resolve_market: pay winners 1 credit per winning share, wipe positions.
create or replace function public.resolve_market(p_market_id uuid, p_resolution text)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare v_role text := public.current_user_role(); m public.markets;
begin
  if v_role not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can resolve markets.';
  end if;
  if p_resolution not in ('yes', 'no') then raise exception 'Resolution must be yes or no.'; end if;

  select * into m from public.markets where id = p_market_id for update;
  if not found then raise exception 'Market not found.'; end if;
  if m.status in ('resolved', 'cancelled') then raise exception 'Market is already settled.'; end if;

  perform set_config('app.privileged', 'on', true);

  -- winners get 1 credit per share of the winning outcome
  update public.profiles p set balance = balance + pos.shares
  from public.positions pos
  where pos.market_id = p_market_id
    and pos.outcome = p_resolution::outcome_type
    and pos.user_id = p.id;

  delete from public.positions where market_id = p_market_id;

  update public.markets
    set status = 'resolved', resolution = p_resolution::outcome_type, resolved_at = now()
    where id = p_market_id
    returning * into m;

  return m;
end;
$$;

-- cancel_market: refund every holder their cost basis (shares * avg_price).
create or replace function public.cancel_market(p_market_id uuid)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare v_role text := public.current_user_role(); m public.markets;
begin
  if v_role not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can cancel markets.';
  end if;

  select * into m from public.markets where id = p_market_id for update;
  if not found then raise exception 'Market not found.'; end if;
  if m.status in ('resolved', 'cancelled') then raise exception 'Market is already settled.'; end if;

  perform set_config('app.privileged', 'on', true);

  update public.profiles p set balance = balance + (pos.shares * pos.avg_price)
  from public.positions pos
  where pos.market_id = p_market_id and pos.user_id = p.id;

  delete from public.positions where market_id = p_market_id;

  update public.markets set status = 'cancelled', resolved_at = now()
    where id = p_market_id
    returning * into m;

  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Admin-only user management
-- ---------------------------------------------------------------------------

-- admin_set_balance: set an absolute play-money balance for a user.
create or replace function public.admin_set_balance(p_user_id uuid, p_balance numeric)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare pr public.profiles;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can adjust balances.';
  end if;
  if p_balance < 0 then p_balance := 0; end if;
  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = p_balance where id = p_user_id returning * into pr;
  if not found then raise exception 'User not found.'; end if;
  return pr;
end;
$$;

-- admin_set_role: promote a user to sub-admin or demote back to user.
-- (Admins cannot be created or demoted through this function.)
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare pr public.profiles; v_target_role user_role;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can change roles.';
  end if;
  if p_role not in ('user', 'subadmin') then
    raise exception 'Role must be user or subadmin.';
  end if;
  select role into v_target_role from public.profiles where id = p_user_id;
  if v_target_role is null then raise exception 'User not found.'; end if;
  if v_target_role = 'admin' then raise exception 'You cannot change an admin''s role.'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set role = p_role::user_role where id = p_user_id returning * into pr;
  return pr;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Leaderboard view: net worth = balance + mark-to-market open positions
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard as
select
  p.id,
  p.username,
  p.display_name,
  p.role,
  p.balance,
  p.balance + coalesce((
    select sum(
      pos.shares * (
        case when pos.outcome = 'yes'
          then public.lmsr_price_yes(m.q_yes, m.q_no, m.b)
          else 1 - public.lmsr_price_yes(m.q_yes, m.q_no, m.b)
        end
      )
    )
    from public.positions pos
    join public.markets m on m.id = pos.market_id
    where pos.user_id = p.id and m.status in ('open', 'closed')
  ), 0) as net_worth
from public.profiles p;

-- Per-market trading stats (volume / trade count / unique traders) for cards.
create or replace view public.market_stats as
select
  m.id as market_id,
  coalesce(sum(abs(t.cost)), 0) as volume,
  count(t.id) as trade_count,
  count(distinct t.user_id) as trader_count
from public.markets m
left join public.trades t on t.market_id = m.id
group by m.id;

-- ---------------------------------------------------------------------------
-- 11. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.markets   enable row level security;
alter table public.positions enable row level security;
alter table public.trades    enable row level security;
alter table public.comments  enable row level security;

-- profiles: anyone can read (needed for leaderboard, usernames, holders).
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles for select using (true);

-- profiles: a user may update only their own row. The protect_profile trigger
-- still blocks role/balance/username/id changes.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- markets / positions / trades: world-readable, but writable ONLY through the
-- SECURITY DEFINER functions above (no insert/update/delete policies exist, so
-- direct client writes are denied by RLS).
drop policy if exists markets_select_all on public.markets;
create policy markets_select_all on public.markets for select using (true);

drop policy if exists positions_select_all on public.positions;
create policy positions_select_all on public.positions for select using (true);

drop policy if exists trades_select_all on public.trades;
create policy trades_select_all on public.trades for select using (true);

-- comments: world-readable; authenticated users may post/edit/delete their own.
drop policy if exists comments_select_all on public.comments;
create policy comments_select_all on public.comments for select using (true);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert with check (auth.uid() = user_id);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own on public.comments
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 12. Grants (PostgREST exposes these as RPC endpoints)
-- ---------------------------------------------------------------------------
grant select on public.leaderboard to anon, authenticated;
grant select on public.market_stats to anon, authenticated;

grant execute on function public.lmsr_price_yes(numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.lmsr_cost(numeric, numeric, numeric)      to anon, authenticated;
grant execute on function public.current_user_role()                       to anon, authenticated;
grant execute on function public.quote_trade(uuid, text, text, numeric)    to anon, authenticated;

grant execute on function public.execute_trade(uuid, text, text, numeric)  to authenticated;
grant execute on function public.create_market(text, text, text, text, numeric, numeric, timestamptz) to authenticated;
grant execute on function public.update_market(uuid, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.set_market_status(uuid, text)             to authenticated;
grant execute on function public.resolve_market(uuid, text)                to authenticated;
grant execute on function public.cancel_market(uuid)                       to authenticated;
grant execute on function public.admin_set_balance(uuid, numeric)          to authenticated;
grant execute on function public.admin_set_role(uuid, text)                to authenticated;

-- ============================================================================
-- End of migration.
-- ============================================================================
