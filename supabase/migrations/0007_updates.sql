-- ============================================================================
-- EBHS Polymarket — migration 0007
--
--   • support_messages  — user ⇄ staff support chat ("tickets")
--   • profiles.last_spin_at + spin_wheel() — weekly spin-to-win
--   • execute_trade()   — now refuses trades after a market's close_at
--   • resolve_group()   — resolve a multi-outcome group to one winning option
--   • admin_delete_user() — admins can delete a user (cascades their positions)
--
-- Run in the Supabase SQL editor on top of 0001–0006. Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Support chat (Discord-ticket style: one thread per user)
-- ---------------------------------------------------------------------------
create table if not exists public.support_messages (
  id             uuid primary key default gen_random_uuid(),
  ticket_user_id uuid not null references public.profiles(id) on delete cascade,
  sender_id      uuid references public.profiles(id) on delete set null,
  from_staff     boolean not null default false,
  body           text not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_support_ticket on public.support_messages (ticket_user_id, created_at);

alter table public.support_messages enable row level security;

drop policy if exists support_select on public.support_messages;
create policy support_select on public.support_messages for select
  using (auth.uid() = ticket_user_id or public.current_user_role() in ('admin', 'subadmin'));

drop policy if exists support_insert on public.support_messages;
create policy support_insert on public.support_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      (ticket_user_id = auth.uid() and from_staff = false)
      or (from_staff = true and public.current_user_role() in ('admin', 'subadmin'))
    )
  );

grant select, insert on public.support_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Spin the wheel (weekly): $100 / $50 / $25 / nothing
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists last_spin_at timestamptz;

create or replace function public.spin_wheel()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_prize numeric;
  v_r double precision := random();
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;

  select last_spin_at into v_last from public.profiles where id = v_uid for update;
  if v_last is not null and v_last > now() - interval '7 days' then
    raise exception 'You already spun this week. Come back later!';
  end if;

  -- weighted: 5% $100, 10% $50, 20% $25, 65% nothing
  if    v_r < 0.05 then v_prize := 100;
  elsif v_r < 0.15 then v_prize := 50;
  elsif v_r < 0.35 then v_prize := 25;
  else                  v_prize := 0;
  end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles
    set balance = balance + v_prize, last_spin_at = now()
    where id = v_uid
    returning balance into v_new_balance;

  return json_build_object('prize', v_prize, 'new_balance', v_new_balance);
end;
$$;

grant execute on function public.spin_wheel() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. execute_trade — now also enforces close_at (no bets after the close time)
-- ---------------------------------------------------------------------------
create or replace function public.execute_trade(
  p_market_id uuid,
  p_outcome   text,
  p_side      text,
  p_value     numeric
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
  if m.close_at is not null and now() > m.close_at then
    raise exception 'This market has closed for trading.';
  end if;

  v_b := m.b; v_qy := m.q_yes; v_qn := m.q_no;
  v_price_before := public.lmsr_price_yes(m.q_yes, m.q_no, m.b);
  v_c0 := public.lmsr_cost(m.q_yes, m.q_no, m.b);

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
    v_shares := p_value;
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
    'side', p_side, 'outcome', p_outcome,
    'shares', (case when p_side = 'buy' then v_shares else p_value::double precision end),
    'cost', (case when p_side = 'buy' then v_cost else v_proceeds end),
    'avg_price', v_avg, 'price_before', v_price_before,
    'price_after', v_price_after, 'new_balance', v_new_balance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. resolve_group — resolve a multi-outcome group to one winning option.
--    Winner resolves YES (→ 100¢, holders paid 1 each); the rest resolve NO.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_group(p_group_id uuid, p_winner_market_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if public.current_user_role() not in ('admin', 'subadmin') then
    raise exception 'Only admins and sub-admins can resolve markets.';
  end if;
  for r in
    select id from public.markets
    where group_id = p_group_id and status in ('open', 'closed')
  loop
    if r.id = p_winner_market_id then
      perform public.resolve_market(r.id, 'yes');
    else
      perform public.resolve_market(r.id, 'no');
    end if;
  end loop;
end;
$$;

grant execute on function public.resolve_group(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. admin_delete_user — remove a user and all their positions
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_role user_role;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can delete users.';
  end if;
  if p_user_id = auth.uid() then raise exception 'You cannot delete yourself.'; end if;
  select role into v_role from public.profiles where id = p_user_id;
  if v_role is null then raise exception 'User not found.'; end if;
  if v_role = 'admin' then raise exception 'You cannot delete another admin.'; end if;

  -- Deleting the auth user cascades to profiles → positions (and nulls trades).
  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ============================================================================
-- End of migration 0007.
-- ============================================================================
