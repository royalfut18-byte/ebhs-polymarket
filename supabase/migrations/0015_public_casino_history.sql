-- ============================================================================
-- EBHS Polymarket - migration 0015: PUBLIC CASINO HISTORY
--
-- Makes casino bet history world-readable so public profiles can show each
-- player's recent casino results, the same way positions and trades already do.
--
-- Run in the Supabase SQL editor on top of 0001-0014. Re-runnable.
-- ============================================================================

drop policy if exists casino_bets_select_own on public.casino_bets;
drop policy if exists casino_bets_select_all on public.casino_bets;

create policy casino_bets_select_all on public.casino_bets
  for select using (true);

grant select on public.casino_bets to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0015.
-- ============================================================================
