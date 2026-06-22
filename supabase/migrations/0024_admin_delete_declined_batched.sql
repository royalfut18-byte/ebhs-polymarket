-- ============================================================================
-- EBHS Polymarket — migration 0024: fix "delete all declined" timeout
--
-- admin_delete_all_declined() deleted every declined auth.users row in ONE
-- statement. With many declined accounts the cascading deletes ran past the
-- default statement_timeout and Postgres cancelled it ("canceling statement
-- due to statement timeout"). Fix:
--   • delete in small batches (100 at a time) so each statement is quick, and
--   • raise statement_timeout for the function itself as a safety net.
-- Same hardening applied to admin_decline_all_pending().
--
-- Run in the Supabase SQL editor on top of 0001–0023. Re-runnable.
-- ============================================================================

create or replace function public.admin_decline_all_pending()
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '120000'   -- 2 min ceiling, well above the default
as $$
declare v_count int;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can decline accounts.';
  end if;

  perform set_config('app.privileged', 'on', true);

  update auth.users
    set banned_until = now() + interval '100 years'
    where id in (
      select id from public.profiles where approval_status = 'pending' and role <> 'admin'
    );

  update public.profiles
    set approval_status = 'declined'
    where approval_status = 'pending' and role <> 'admin';
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.admin_delete_all_declined()
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '120000'
as $$
declare
  v_total int := 0;
  v_batch int;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can delete users.';
  end if;

  -- Delete in batches so no single statement runs long enough to time out.
  -- Each delete cascades through profiles → positions (and nulls trades).
  loop
    with del as (
      delete from auth.users
      where id in (
        select id from public.profiles
        where approval_status = 'declined' and role <> 'admin'
        limit 100
      )
      returning id
    )
    select count(*) into v_batch from del;

    v_total := v_total + v_batch;
    exit when v_batch = 0;
  end loop;

  return v_total;
end;
$$;

grant execute on function public.admin_decline_all_pending() to authenticated;
grant execute on function public.admin_delete_all_declined() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0024.
-- ============================================================================
