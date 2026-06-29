-- ============================================================================
-- EBHS Polymarket — migration 0043: re-cap Flappy at 10×
--
-- 0041 lifted the multiplier cap (1000× safety ceiling). Skilled/scripted
-- players farmed it hard (~100k), so put the 10× cap back: mult flat-lines at
-- 10× (~pipe 27). With the $100 max bet (0039) that bounds a Flappy round to a
-- $1000 max payout. Reverts the cap part of 0041; the rake curve is unchanged.
--
-- Run in the Supabase SQL editor on top of 0001-0042. Re-runnable.
-- ============================================================================

create or replace function public._flappy_mult(p_pipes int)
returns numeric
language sql
immutable
as $$ select greatest(0, least(round((0.5 * power(1.12, greatest(p_pipes, 0)))::numeric, 2), 10)); $$;

grant execute on function public._flappy_mult(int) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0043.
-- ============================================================================
