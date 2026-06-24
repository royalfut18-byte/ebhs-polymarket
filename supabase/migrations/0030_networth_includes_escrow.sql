-- ============================================================================
-- EBHS Polymarket — migration 0030: net worth must include ESCROWED money
--
-- Exploit: sending an arena challenge (or opening/joining an Uno table) escrows
-- your stake — it leaves `balance` immediately. _net_worth() only counted
-- balance + open positions, so challenging yourself for all your cash made net
-- worth read ~$0 and triggered the reflection rehab ($1000). Cancelling the
-- challenge then refunded the stake → free money, repeatable.
--
-- Fix: escrowed stake is still YOUR money, so count it. Net worth now adds:
--   • stakes in your own PENDING challenges, and
--   • your stakes in ACTIVE / LOBBY matches (chess, pool, uno).
-- Now moving cash into escrow doesn't change your net worth, so it can't fake
-- being broke. (You only drop to <=$50 by genuinely losing it.)
--
-- Run in the Supabase SQL editor on top of 0001–0029. Re-runnable.
-- ============================================================================

create or replace function public._net_worth(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    p.balance
    -- value of open/closed market positions
    + coalesce((
        select sum(
          pos.shares * (
            case when pos.outcome = 'yes'
              then public.lmsr_price_yes(m.q_yes, m.q_no, m.b)
              else 1 - public.lmsr_price_yes(m.q_yes, m.q_no, m.b)
            end
          )
        )
        from public.positions pos
        join public.markets m on m.id = pos.market_id
        where pos.user_id = p.id and m.status in ('open', 'closed')
      ), 0)
    -- stake escrowed in your own pending challenges
    + coalesce((
        select sum(c.stake)
        from public.arena_challenges c
        where c.challenger_id = p.id and c.status = 'pending'
      ), 0)
    -- your stake escrowed in active / waiting matches
    + coalesce((
        select sum(mp.stake)
        from public.arena_match_players mp
        join public.arena_matches am on am.id = mp.match_id
        where mp.user_id = p.id and am.status in ('active', 'lobby')
      ), 0)
  from public.profiles p
  where p.id = p_uid;
$$;

grant execute on function public._net_worth(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0030.
-- ============================================================================
