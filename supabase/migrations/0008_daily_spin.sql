-- ============================================================================
-- EBHS Polymarket — migration 0008
--
-- Change the spin-the-wheel cooldown from weekly to DAILY.
-- Run in the Supabase SQL editor on top of 0001–0007. Re-runnable.
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
  if v_last is not null and v_last > now() - interval '1 day' then
    raise exception 'You already spun today. Come back tomorrow!';
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

-- ============================================================================
-- End of migration 0008.
-- ============================================================================
