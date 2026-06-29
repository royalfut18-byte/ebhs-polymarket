-- ============================================================================
-- EBHS Polymarket — migration 0049: remove FLAPPY entirely
--
-- Flappy is being pulled from the casino (a bettable client-side skill game
-- couldn't be made both cheat-proof and fun). Drop all its server functions so
-- the round can't be started/settled even via a direct RPC call.
--
-- Historical casino_bets rows (game='flappy') are LEFT IN PLACE — they're the
-- settled ledger/history. The casino landing page just stops showing Flappy
-- because it's removed from the games list, so the old wager total isn't
-- surfaced anywhere.
--
-- Run in the Supabase SQL editor on top of 0001-0048. Re-runnable.
-- ============================================================================

drop function if exists public.casino_flappy_pipe(uuid);
drop function if exists public.casino_flappy_cashout(uuid, int);
drop function if exists public.casino_flappy_lose(uuid, int);
drop function if exists public.casino_flappy_start(numeric);
drop function if exists public._flappy_mult(int);

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0049.
-- ============================================================================
