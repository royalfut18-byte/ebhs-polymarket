-- ============================================================================
-- EBHS Polymarket — migration 0050: ADMIN tournament reset
--
-- One-button "fresh start": sets every player's balance back to $1000 and wipes
-- the leaderboard clean. Admin-only AND gated by a confirmation password ('1261')
-- checked server-side so the button can't be fired by accident or by a non-admin.
--
-- To land everyone at exactly $1000 net worth (leaderboard = balance + open
-- position value) and avoid minting money from stakes that were escrowed BEFORE
-- the reset, it:
--   * voids active casino rounds, pending arena challenges and live arena matches
--     (their stakes were already deducted; we just don't pay them out post-reset),
--   * deletes all market positions (clears every portfolio),
--   * resets OPEN markets to their starting price (q calibrated from initial_prob),
--   * sets every balance to 1000.
-- Trade / casino-bet history is left intact (it doesn't affect the live ranking).
--
-- Run in the Supabase SQL editor on top of 0001-0049. Re-runnable.
-- ============================================================================

create or replace function public.admin_reset_tournament(p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users int;
  v_p numeric;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can reset the tournament.';
  end if;
  if p_password is null or p_password <> '1261' then
    raise exception 'Incorrect reset password.';
  end if;

  perform set_config('app.privileged', 'on', true);

  -- 1. void in-flight stakes (already deducted) so they can't pay out post-reset
  update public.casino_rounds  set status = 'done',      ended_at  = now() where status = 'active';
  update public.arena_challenges set status = 'cancelled'                   where status = 'pending';
  update public.arena_matches  set status = 'void',      updated_at = now() where status not in ('finished', 'void');

  -- 2. clear every portfolio
  delete from public.positions;

  -- 3. reset OPEN markets to their initial price (q_yes = b*ln(p/(1-p)), q_no = 0)
  update public.markets m
  set q_yes = m.b * ln(v.p / (1 - v.p)),
      q_no  = 0
  from (select id, greatest(least(initial_prob, 0.99), 0.01) as p from public.markets) v
  where v.id = m.id and m.status = 'open';

  -- 4. everyone back to $1000
  update public.profiles set balance = 1000;
  get diagnostics v_users = row_count;

  return json_build_object('reset', true, 'users', v_users);
end;
$$;

grant execute on function public.admin_reset_tournament(text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0050.
-- ============================================================================
