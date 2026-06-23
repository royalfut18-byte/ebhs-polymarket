-- ============================================================================
-- EBHS Polymarket — migration 0029: REFLECTION must track ACTUAL watch time
--
-- Bug: the reward unlocked on WALL-CLOCK time since the lock began
-- (reflection_started_at). So closing the tab / signing out and reopening
-- later made the timer "elapsed" instantly — claim without watching.
--
-- Fix: track actual watched seconds. The client pings its video position while
-- playing; the server advances reflection_watch_seconds but NEVER faster than
-- real wall-time between pings (anti-spoof / anti-seek) and never past the video
-- position reported (so you must really play through it). The reward now
-- requires reflection_watch_seconds >= required, which only accrues while the
-- video is actually playing — a closed tab accrues nothing.
--
-- Run in the Supabase SQL editor on top of 0001–0028. Re-runnable.
-- ============================================================================

alter table public.profiles add column if not exists reflection_watch_seconds numeric not null default 0;
alter table public.profiles add column if not exists reflection_ping_at timestamptz;

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
  v_watch numeric := 0;
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_used int;
  v_max int := public._reflection_max_per_day();
begin
  if v_uid is null then return json_build_object('locked', false); end if;
  v_nw := public._net_worth(v_uid);
  v_locked := v_nw <= 50;

  perform set_config('app.privileged', 'on', true);
  if v_locked then
    select reflection_started_at, reflection_watch_seconds, rehab_count, rehab_day
      into v_started, v_watch, v_count, v_day from public.profiles where id = v_uid;
    if v_started is null then
      -- fresh lock episode → reset the watch accumulator
      update public.profiles
        set reflection_started_at = now(), reflection_watch_seconds = 0, reflection_ping_at = null
        where id = v_uid
        returning reflection_started_at, reflection_watch_seconds into v_started, v_watch;
    end if;
  else
    update public.profiles
      set reflection_started_at = null, reflection_watch_seconds = 0, reflection_ping_at = null
      where id = v_uid and (reflection_started_at is not null or reflection_watch_seconds <> 0);
    select rehab_count, rehab_day into v_count, v_day from public.profiles where id = v_uid;
    v_watch := 0;
  end if;

  v_used := case when v_day = v_today then coalesce(v_count, 0) else 0 end;

  return json_build_object(
    'locked', v_locked,
    'net_worth', round(v_nw, 2),
    'required', public._reflection_required_seconds(),
    'watched', floor(v_watch)::int,
    'used', v_used,
    'max', v_max
  );
end;
$$;

-- Advance the watch accumulator. p_position = furthest video second the client
-- has reached; p_errored = the video failed to load (count real time as an
-- escape so a broken video can't trap anyone). Growth is clamped to the real
-- wall-time since the last ping, so it can't be sped up by spamming or seeking.
create or replace function public.reflection_ping(p_position numeric, p_errored boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_started timestamptz;
  v_watch numeric;
  v_ping timestamptz;
  v_required int := public._reflection_required_seconds();
  v_delta numeric;
  v_target numeric;
begin
  if v_uid is null then return json_build_object('watched', 0); end if;
  if public._net_worth(v_uid) > 50 then return json_build_object('watched', 0); end if;

  perform set_config('app.privileged', 'on', true);
  select reflection_started_at, reflection_watch_seconds, reflection_ping_at
    into v_started, v_watch, v_ping from public.profiles where id = v_uid for update;
  if v_started is null then return json_build_object('watched', floor(coalesce(v_watch, 0))::int); end if;

  -- max real seconds we'll credit since the previous ping (caps spoofing)
  v_delta := least(greatest(extract(epoch from (now() - coalesce(v_ping, now()))), 0), 7);

  if p_errored then
    v_target := coalesce(v_watch, 0) + v_delta;
  else
    -- can't exceed the position actually reached, nor grow faster than real time
    v_target := least(coalesce(p_position, 0), coalesce(v_watch, 0) + v_delta);
  end if;

  v_watch := least(greatest(coalesce(v_watch, 0), v_target), v_required + 5);

  update public.profiles set reflection_watch_seconds = v_watch, reflection_ping_at = now() where id = v_uid;
  return json_build_object('watched', floor(v_watch)::int, 'required', v_required);
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
  v_watch numeric;
  v_required int := public._reflection_required_seconds();
  v_max int := public._reflection_max_per_day();
  v_count int;
  v_day date;
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_new_balance numeric;
begin
  if v_uid is null then raise exception 'You must be logged in.'; end if;
  select reflection_started_at, reflection_watch_seconds, rehab_count, rehab_day
    into v_started, v_watch, v_count, v_day from public.profiles where id = v_uid for update;
  v_nw := public._net_worth(v_uid);

  if v_nw > 50 then raise exception 'You are not locked.'; end if;
  if v_started is null then raise exception 'Reflection has not started.'; end if;
  if coalesce(v_watch, 0) < v_required then
    raise exception 'Keep watching — % more seconds before the reward unlocks.', ceil(v_required - coalesce(v_watch, 0));
  end if;

  if v_day is distinct from v_today then v_count := 0; end if;
  if coalesce(v_count, 0) >= v_max then
    raise exception 'You have used all % rehabs today. Come back after midnight.', v_max;
  end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles
    set balance = balance + 1000,
        rehab_count = coalesce(v_count, 0) + 1,
        rehab_day = v_today,
        reflection_started_at = null,
        reflection_watch_seconds = 0,
        reflection_ping_at = null
    where id = v_uid
    returning balance into v_new_balance;

  return json_build_object('ok', true, 'reward', 1000, 'new_balance', v_new_balance,
                           'used', coalesce(v_count, 0) + 1, 'max', v_max);
end;
$$;

grant execute on function public.reflection_status()                      to authenticated;
grant execute on function public.reflection_ping(numeric, boolean)        to authenticated;
grant execute on function public.reflection_reward()                      to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0029.
-- ============================================================================
