-- ============================================================================
-- EBHS Polymarket — migration 0040: stale active casino rounds must NOT prop up
-- net worth (fixes the reflection rehab never showing up)
--
-- Bug: 0031 added the bet of any status='active' casino round to _net_worth so a
-- player isn't locked mid-round. But an ABANDONED round (close the tab / navigate
-- away without cashing out or crashing) stays 'active' forever, so its bet keeps
-- counting toward net worth permanently. A broke player ($0 balance) who once
-- abandoned a round bigger than the $50 threshold therefore never drops to <=$50,
-- so the rehab gate never appears — on any device, since it's their server-side
-- net worth.
--
-- Fix: only count an active round while it's plausibly still being played. A real
-- round lasts seconds to a couple of minutes; bound the contribution to rounds
-- created in the last 15 minutes. Older 'active' rounds are abandoned (lost money)
-- and stop counting, so the gate can trigger. The client already suppresses the
-- overlay live via the round signal, so genuine in-progress play is unaffected.
--
-- Extends 0031. Run in the Supabase SQL editor on top of 0001-0039. Re-runnable.
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
    -- bet held in an in-progress casino round — only while genuinely live, so an
    -- abandoned (never-settled) round can't prop up net worth indefinitely.
    + coalesce((
        select sum(r.bet)
        from public.casino_rounds r
        where r.user_id = p.id and r.status = 'active'
          and r.created_at > now() - interval '15 minutes'
      ), 0)
  from public.profiles p
  where p.id = p_uid;
$$;

grant execute on function public._net_worth(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0040.
-- ============================================================================
