-- ============================================================================
-- EBHS Polymarket — migration 0020
--
-- Change daily spin cooldown from "24 hours since last spin" to
-- "once per calendar day (UTC midnight reset)".
-- Users can spin again as soon as midnight UTC ticks over.
--
-- Run in the Supabase SQL editor on top of 0001–0019. Re-runnable.
-- ============================================================================

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

  -- Block if they already spun today (UTC calendar day).
  if v_last is not null and v_last::date >= (now() at time zone 'utc')::date then
    raise exception 'You already spun today. Come back at midnight!';
  end if;

  -- weighted: 3% $1000, 12% $500, 85% $50 (always a win)
  if    v_r < 0.03 then v_prize := 1000;
  elsif v_r < 0.15 then v_prize := 500;
  else                  v_prize := 50;
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

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0020.
-- ============================================================================
