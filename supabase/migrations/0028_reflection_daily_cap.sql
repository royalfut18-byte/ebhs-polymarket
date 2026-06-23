-- ============================================================================
-- EBHS Polymarket — migration 0028: REFLECTION DAILY CAP (max 5 rehabs/day)
--
-- Builds on 0027. A user can now claim at most 5 reflection rewards per day,
-- resetting at MIDNIGHT SYDNEY time (same as the daily spin, migration 0020).
-- reflection_status() now also reports how many rehabs are used / remaining so
-- the client can show a counter; reflection_reward() enforces the cap.
--
-- Run in the Supabase SQL editor on top of 0001–0027. Re-runnable.
-- ============================================================================

alter table public.profiles add column if not exists rehab_count int not null default 0;
alter table public.profiles add column if not exists rehab_day date;

create or replace function public._reflection_max_per_day()
returns int language sql immutable as $$ select 5 $$;

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
  v_count int;
  v_day date;
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_used int;
  v_max int := public._reflection_max_per_day();
begin
  if v_uid is null then return json_build_object('locked', false); end if;
  v_nw := public._net_worth(v_uid);
  v_locked := v_nw <= 50;

  perform set_config('app.privileged', 'on', true);
  if v_locked then
    select reflection_started_at, rehab_count, rehab_day into v_started, v_count, v_day
      from public.profiles where id = v_uid;
    if v_started is null then
      update public.profiles set reflection_started_at = now() where id = v_uid
        returning reflection_started_at into v_started;
    end if;
  else
    update public.profiles set reflection_started_at = null
      where id = v_uid and reflection_started_at is not null;
    v_started := null;
    select rehab_count, rehab_day into v_count, v_day from public.profiles where id = v_uid;
  end if;

  v_used := case when v_day = v_today then coalesce(v_count, 0) else 0 end;

  return json_build_object(
    'locked', v_locked,
    'net_worth', round(v_nw, 2),
    'required', public._reflection_required_seconds(),
    'elapsed', case when v_started is null then 0 else floor(extract(epoch from (now() - v_started)))::int end,
    'used', v_used,
    'max', v_max
  );
end;
$$;

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
  v_max int := public._reflection_max_per_day();
  v_count int;
  v_day date;
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select reflection_started_at, rehab_count, rehab_day into v_started, v_count, v_day
    from public.profiles where id = v_uid for update;
  v_nw := public._net_worth(v_uid);

  if v_nw > 50 then raise exception 'You are not locked.'; end if;
  if v_started is null then raise exception 'Reflection has not started.'; end if;
  if now() - v_started < make_interval(secs => v_required) then
    raise exception 'Keep watching — the reward unlocks when the video ends.';
  end if;

  -- daily cap (resets at Sydney midnight)
  if v_day is distinct from v_today then v_count := 0; end if;
  if coalesce(v_count, 0) >= v_max then
    raise exception 'You have used all % rehabs today. Come back after midnight.', v_max;
  end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles
    set balance = balance + 1000,
        rehab_count = coalesce(v_count, 0) + 1,
        rehab_day = v_today,
        reflection_started_at = null
    where id = v_uid
    returning balance into v_new_balance;

  return json_build_object('ok', true, 'reward', 1000, 'new_balance', v_new_balance,
                           'used', coalesce(v_count, 0) + 1, 'max', v_max);
end;
$$;

grant execute on function public._reflection_max_per_day()  to authenticated;
grant execute on function public.reflection_status()        to authenticated;
grant execute on function public.reflection_reward()        to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0028.
-- ============================================================================
