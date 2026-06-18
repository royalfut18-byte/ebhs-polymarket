-- ============================================================================
-- EBHS Polymarket - migration 0014: ADMIN WHEEL RESET
--
-- Adds an admin-only RPC to clear the daily-spin cooldown for every user.
-- This lets staff re-enable the wheel globally without touching balances.
--
-- Run in the Supabase SQL editor on top of 0001-0013. Re-runnable.
-- ============================================================================

create or replace function public.admin_reset_all_wheels()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can reset the wheel for all users.';
  end if;

  perform set_config('app.privileged', 'on', true);

  update public.profiles
  set last_spin_at = null
  where last_spin_at is not null;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

grant execute on function public.admin_reset_all_wheels() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0014.
-- ============================================================================
