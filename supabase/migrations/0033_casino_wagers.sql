-- ============================================================================
-- EBHS Polymarket — migration 0033: CASINO TOTAL WAGERS (per game)
--
-- The casino landing page shows total amount wagered per game (with a live
-- green dot). casino_bets is own-row RLS, so this SECURITY DEFINER aggregate
-- exposes only non-personal totals.
--
-- Run in the Supabase SQL editor on top of 0001–0032. Re-runnable.
-- ============================================================================

create or replace function public.casino_wagers()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_object_agg(game, total), '{}'::json)
  from (
    select game, sum(bet)::numeric as total
    from public.casino_bets
    group by game
  ) t;
$$;

grant execute on function public.casino_wagers() to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0033.
-- ============================================================================
