-- ============================================================================
-- EBHS Polymarket — migration 0012: PRESERVE VOLUME ON DELETE
--
-- The homepage "Volume" / "Trades" stats sum market_stats over the markets
-- that currently exist. Deleting a market cascades its trades away, so those
-- totals used to DROP when an admin removed a market.
--
-- Fix: before a market is deleted, fold its lifetime volume + trade count into
-- a persistent accumulator (app_settings 'retired_stats'). The homepage adds
-- this to the live sum, so the headline totals never go backwards on a delete.
-- (Resolving / cancelling a market keeps the row, so those already counted.)
--
-- Run in the Supabase SQL editor on top of 0001–0011. Re-runnable.
-- ============================================================================

create or replace function public.delete_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol    numeric := 0;
  v_trades bigint  := 0;
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

  -- snapshot this market's lifetime activity, then bank it so the homepage
  -- totals don't drop when the market (and its trades) are removed
  select coalesce(sum(abs(cost)), 0), count(*)
    into v_vol, v_trades
    from public.trades where market_id = p_market_id;

  if v_vol > 0 or v_trades > 0 then
    insert into public.app_settings (key, value, updated_at)
    values ('retired_stats', jsonb_build_object('volume', v_vol, 'trades', v_trades), now())
    on conflict (key) do update set
      value = jsonb_build_object(
        'volume',  coalesce((public.app_settings.value ->> 'volume')::numeric, 0) + v_vol,
        'trades',  coalesce((public.app_settings.value ->> 'trades')::numeric, 0) + v_trades
      ),
      updated_at = now();
  end if;

  -- cascades to positions / trades / comments
  delete from public.markets where id = p_market_id;
end;
$$;

grant execute on function public.delete_market(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0012.
-- ============================================================================
