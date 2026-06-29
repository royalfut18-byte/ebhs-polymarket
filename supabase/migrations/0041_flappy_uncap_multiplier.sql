-- ============================================================================
-- EBHS Polymarket — migration 0041: lift Flappy's 10× multiplier cap
--
-- The 0038 rake curve clamped the multiplier at 10× (reached ~pipe 27), so a
-- deep run just flat-lined at 10×. Remove that gameplay cap and let the curve
-- keep climbing: mult(n) = 0.5 · 1.12^n.
--
-- A skill game with a TRULY infinite cap is exploitable (the time-gate only
-- limits the pipe RATE, not the total, so a perfect script could mint an
-- absurd payout and overflow balances), so keep a far-off safety ceiling of
-- 1000× — the same one Crash / Limbo / Plinko use. That sits at ~67 pipes,
-- which no real run reaches, so in practice the multiplier is unlimited.
--
--   pipes:  27    30     40     50     67
--   mult:   10×   15×    47×    144×   1000× (safety cap)
--
-- Only _flappy_mult changes. Run in the Supabase SQL editor on top of
-- 0001-0040. Re-runnable.
-- ============================================================================

create or replace function public._flappy_mult(p_pipes int)
returns numeric
language sql
immutable
as $$ select greatest(0, least(round((0.5 * power(1.12, greatest(p_pipes, 0)))::numeric, 2), 1000)); $$;

grant execute on function public._flappy_mult(int) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0041.
-- ============================================================================
