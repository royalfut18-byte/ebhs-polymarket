-- ============================================================================
-- EBHS Polymarket — migration 0051: NEW-SEASON cleanup (free up Supabase space)
--
-- Wipes the old season's gameplay HISTORY to reclaim database space. This is
-- pure history — it does NOT touch balances, profiles, markets, positions,
-- prizes, past winners, support tickets or any config, so the leaderboard and
-- everyone's money are unaffected. The cleared logs simply regenerate as people
-- play the new season.
--
-- TRUNCATE (not DELETE) so the disk is reclaimed IMMEDIATELY — no VACUUM needed.
--
-- WHAT THIS CLEARS:
--   * casino_bets    — every settled casino bet (the biggest table by far)
--   * casino_rounds  — multi-step game round state
--   * trades         — every market buy/sell (market volume display resets to 0)
--   * arena_matches  — chess/uno/pool match state (+ cascades to match players,
--                      chat and uno hand/state), all challenges, and presence
--
-- WHAT IT KEEPS: profiles & balances, markets, positions, app_settings (prizes /
--   past winners), comments, suggestions, support + admin messages.
--
-- ⚠️  Run this during a QUIET window (ideally right AFTER the tournament reset),
--    when nobody is mid-game — TRUNCATE drops in-flight rounds/matches too.
--
-- Run in the Supabase SQL editor on top of 0001-0050. Re-runnable.
-- ============================================================================

truncate table
  public.casino_bets,
  public.casino_rounds,
  public.trades
  restart identity;

-- arena_matches CASCADE also clears match_players, arena_chat, uno hands/state
-- and challenges (all FK-linked to it).
truncate table public.arena_matches cascade;
truncate table public.arena_challenges cascade;
truncate table public.arena_presence;

-- ============================================================================
-- End of migration 0051.
-- ============================================================================
