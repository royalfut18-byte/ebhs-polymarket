-- ============================================================================
-- EBHS Polymarket — migration 0042: keep staff test bets out of the public
-- "total wagered" stat
--
-- The casino landing page shows total wagered per game (casino_wagers()). It
-- summed EVERY casino_bets row, so an admin testing with an absurd stake (e.g.
-- 100000000000000) blew the public number out to nonsense. The total is meant
-- to reflect genuine player activity, so exclude staff (admin / subadmin)
-- accounts. Recomputed live, so this also fixes the already-inflated display.
--
-- Run in the Supabase SQL editor on top of 0001-0041. Re-runnable.
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
    select b.game, sum(b.bet)::numeric as total
    from public.casino_bets b
    join public.profiles p on p.id = b.user_id
    where p.role not in ('admin', 'subadmin')  -- exclude staff test bets
    group by b.game
  ) t;
$$;

grant execute on function public.casino_wagers() to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0042.
-- ============================================================================
