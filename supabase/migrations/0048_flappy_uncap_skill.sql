-- ============================================================================
-- EBHS Polymarket — migration 0048: lift Flappy's 10x cap (pure-skill mode)
--
-- 0047 kept the 10x cap; the owner wants the multiplier to keep climbing with a
-- run. Remove the gameplay cap — mult is still the rake curve 0.5 * 1.12^pipes,
-- now only bounded by a far-off 1000x safety ceiling (the same one Crash / Limbo
-- / Plinko use). That sits at ~pipe 67, unreachable in real play, so it's
-- effectively uncapped; it only exists so an unbounded run (a bot flying for
-- minutes) can't mint an astronomical payout and overflow balances/leaderboard.
--
--   pipes:  7     15    27     40     54     67
--   mult:  1.10  2.74  10.7   46.5   565    1000 (safety cap)
--
-- $100 max bet stays. Only _flappy_mult changes. Run on top of 0001-0047.
-- Re-runnable.
-- ============================================================================

create or replace function public._flappy_mult(p_pipes int)
returns numeric
language sql
immutable
as $$ select greatest(0, least(round((0.5 * power(1.12, greatest(p_pipes, 0)))::numeric, 2), 1000)); $$;

grant execute on function public._flappy_mult(int) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0048.
-- ============================================================================
