-- ============================================================================
-- EBHS Polymarket — migration 0031: net worth must include IN-PLAY casino bets
--
-- Multi-step casino games (mines, crash, hi-lo, blackjack) deduct the bet from
-- balance when the round STARTS and only pay out on cash-out/settle. So going
-- all-in left balance ~$0 mid-round, which tripped the reflection rehab before
-- the game even finished. The staked bet of an active round is still your money
-- in play, so count it — net worth no longer dips while a round is unresolved.
--
-- Extends 0030 (which added arena escrow). Run in the Supabase SQL editor on
-- top of 0001–0030. Re-runnable.
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
    -- bet held in an in-progress casino round (mines/crash/hi-lo/blackjack)
    + coalesce((
        select sum(r.bet)
        from public.casino_rounds r
        where r.user_id = p.id and r.status = 'active'
      ), 0)
  from public.profiles p
  where p.id = p_uid;
$$;

grant execute on function public._net_worth(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0031.
-- ============================================================================
