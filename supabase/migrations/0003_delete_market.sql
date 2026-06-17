-- ============================================================================
-- EBHS Polymarket — migration 0003
--
-- Adds delete_market(): admins can permanently remove a market.
-- Before deleting, any open holders are refunded their cost basis
-- (shares × avg_price) so no one loses play money. Deleting the market row
-- cascades to its positions, trades and comments (FK on delete cascade).
--
-- Run this in the Supabase SQL editor on top of 0001 + 0002. Re-runnable.
-- ============================================================================

create or replace function public.delete_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can delete markets.';
  end if;

  perform set_config('app.privileged', 'on', true);

  -- refund every holder their cost basis before the market disappears
  update public.profiles p
  set balance = balance + (pos.shares * pos.avg_price)
  from public.positions pos
  where pos.market_id = p_market_id and pos.user_id = p.id;

  -- cascades to positions / trades / comments
  delete from public.markets where id = p_market_id;
end;
$$;

grant execute on function public.delete_market(uuid) to authenticated;

-- ============================================================================
-- End of migration 0003.
-- ============================================================================
