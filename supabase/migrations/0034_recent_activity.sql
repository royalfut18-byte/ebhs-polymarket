-- ============================================================================
-- EBHS Polymarket — migration 0034: SERVER-WIDE RECENT ACTIVITY
--
-- A unified "recent activity" feed for the homepage: the latest events across
-- casino bets, market trades, and finished arena matches (chess/uno/pool).
-- casino_bets and arena tables are RLS-restricted, so this SECURITY DEFINER
-- aggregate is how the public feed reads them — exposing only USERNAMES (never
-- real names) and non-sensitive event details.
--
-- Run in the Supabase SQL editor on top of 0001–0033. Re-runnable.
-- ============================================================================

create index if not exists idx_casino_bets_created on public.casino_bets (created_at desc);
create index if not exists idx_arena_matches_finished on public.arena_matches (finished_at desc);

create or replace function public.recent_activity(p_limit int default 10)
returns json
language sql
security definer
stable
set search_path = public
as $$
  with casino as (
    select b.created_at as at,
      jsonb_build_object(
        'kind', 'casino', 'at', b.created_at, 'username', pr.username,
        'game', b.game, 'bet', b.bet, 'payout', b.payout, 'won', (b.payout > 0)
      ) as data
    from public.casino_bets b
    join public.profiles pr on pr.id = b.user_id
    order by b.created_at desc
    limit p_limit
  ),
  trade as (
    select t.created_at as at,
      jsonb_build_object(
        'kind', 'trade', 'at', t.created_at, 'username', pr.username,
        'side', t.side, 'outcome', t.outcome, 'shares', t.shares, 'market', m.question
      ) as data
    from public.trades t
    join public.profiles pr on pr.id = t.user_id
    join public.markets m on m.id = t.market_id
    where t.user_id is not null
    order by t.created_at desc
    limit p_limit
  ),
  arena as (
    -- one row per finished match per player. Multiplayer Uno only contributes
    -- the winner (so it can't flood the feed); chess/pool contribute both sides.
    select am.finished_at as at,
      jsonb_build_object(
        'kind', 'arena', 'at', am.finished_at, 'username', pr.username,
        'game', am.game, 'outcome', mp.outcome, 'pot', am.pot
      ) as data
    from public.arena_match_players mp
    join public.arena_matches am on am.id = mp.match_id
    join public.profiles pr on pr.id = mp.user_id
    where am.status = 'finished' and am.finished_at is not null
      and mp.outcome in ('win', 'loss', 'draw')
      and (mp.outcome = 'win' or am.game in ('chess', 'pool'))
    order by am.finished_at desc
    limit p_limit
  ),
  items as (
    select * from casino
    union all select * from trade
    union all select * from arena
  )
  select coalesce(json_agg(data order by at desc), '[]'::json)
  from (select * from items order by at desc limit p_limit) s;
$$;

grant execute on function public.recent_activity(int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration 0034.
-- ============================================================================
