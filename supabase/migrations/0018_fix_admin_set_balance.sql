-- ============================================================================
-- EBHS Polymarket - migration 0018: HARDEN ADMIN BALANCE UPDATES
--
-- Recreates admin_set_balance with an explicit caller-role lookup so balance
-- changes do not depend on nested helper behavior inside a SECURITY DEFINER
-- function. Re-runnable.
-- ============================================================================

create or replace function public.admin_set_balance(p_user_id uuid, p_balance numeric)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.profiles;
  v_actor_role text;
  v_balance numeric;
begin
  select role::text
    into v_actor_role
  from public.profiles
  where id = auth.uid();

  if v_actor_role is distinct from 'admin' then
    raise exception 'Only admins can adjust balances.';
  end if;

  v_balance := greatest(coalesce(p_balance, 0), 0);

  perform set_config('app.privileged', 'on', true);

  update public.profiles
  set balance = v_balance
  where id = p_user_id
  returning * into pr;

  if not found then
    raise exception 'User not found.';
  end if;

  return pr;
end;
$$;

grant execute on function public.admin_set_balance(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0018.
-- ============================================================================
