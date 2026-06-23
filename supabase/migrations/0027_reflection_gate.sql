-- ============================================================================
-- EBHS Polymarket — migration 0027: REFLECTION GATE (responsible-play lock)
--
-- When a user's TOTAL net worth (cash + open-position value) drops to <= $50
-- they are locked into watching a short reflection video. Finishing it grants a
-- $1000 reset. The lock is SERVER-driven (net worth is recomputed here, not
-- trusted from the client) so a page refresh can't escape it. The reward RPC
-- additionally requires that enough real time has elapsed since the lock began,
-- so the video can't simply be skipped by calling the RPC.
--
-- ALL CURRENCY IS FAKE PLAY MONEY.
--
-- Run in the Supabase SQL editor on top of 0001–0026. Re-runnable.
-- ============================================================================

alter table public.profiles add column if not exists reflection_started_at timestamptz;

-- Total net worth = cash + value of open/closed positions (mirrors the
-- leaderboard view's calc).
create or replace function public._net_worth(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select p.balance + coalesce((
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
  ), 0)
  from public.profiles p
  where p.id = p_uid;
$$;

-- Required watch time before the reward unlocks (video is ~222s; leave a margin
-- for load/buffering so genuine watchers aren't blocked).
create or replace function public._reflection_required_seconds()
returns int language sql immutable as $$ select 205 $$;

-- Is the caller currently locked? Lazily stamps reflection_started_at on the
-- first locked check, and clears it once they're back above the threshold.
create or replace function public.reflection_status()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nw numeric;
  v_started timestamptz;
  v_locked boolean;
begin
  if v_uid is null then return json_build_object('locked', false); end if;
  v_nw := public._net_worth(v_uid);
  v_locked := v_nw <= 50;

  perform set_config('app.privileged', 'on', true);
  if v_locked then
    select reflection_started_at into v_started from public.profiles where id = v_uid;
    if v_started is null then
      update public.profiles set reflection_started_at = now() where id = v_uid
        returning reflection_started_at into v_started;
    end if;
  else
    update public.profiles set reflection_started_at = null
      where id = v_uid and reflection_started_at is not null;
    v_started := null;
  end if;

  return json_build_object(
    'locked', v_locked,
    'net_worth', round(v_nw, 2),
    'required', public._reflection_required_seconds(),
    'elapsed', case when v_started is null then 0 else floor(extract(epoch from (now() - v_started)))::int end
  );
end;
$$;

-- Grant the $1000 reset once the video has genuinely been watched.
create or replace function public.reflection_reward()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nw numeric;
  v_started timestamptz;
  v_required int := public._reflection_required_seconds();
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select reflection_started_at into v_started from public.profiles where id = v_uid for update;
  v_nw := public._net_worth(v_uid);

  if v_nw > 50 then raise exception 'You are not locked.'; end if;
  if v_started is null then raise exception 'Reflection has not started.'; end if;
  if now() - v_started < make_interval(secs => v_required) then
    raise exception 'Keep watching — the reward unlocks when the video ends.';
  end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set balance = balance + 1000, reflection_started_at = null
    where id = v_uid
    returning balance into v_new_balance;

  return json_build_object('ok', true, 'reward', 1000, 'new_balance', v_new_balance);
end;
$$;

grant execute on function public._net_worth(uuid)                 to authenticated;
grant execute on function public._reflection_required_seconds()   to authenticated;
grant execute on function public.reflection_status()              to authenticated;
grant execute on function public.reflection_reward()              to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0027.
-- ============================================================================
