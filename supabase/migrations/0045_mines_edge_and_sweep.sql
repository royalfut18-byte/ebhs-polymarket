      -- ============================================================================
      -- EBHS Polymarket — migration 0045: thicken the Mines edge + sweep abandoned rounds
      --
      -- Mines was running ~102% RTP (house slightly down). The RNG is fair and the
      -- secret is unreadable (verified) — the overshoot is (a) a thin 1% edge that
      -- variance easily swamps when there's no max bet, and (b) abandoned rounds whose
      -- losses were never logged, which inflates the logged RTP.
      --
      --   (a) Bump the Mines house edge 1% -> 3% (mult base 0.99 -> 0.97) for a buffer.
      --   (b) One-time: log every stale active round (any game) as the loss it already
      --       is. The bet already left the player's balance at start, so this is pure
      --       accounting — it records the loss and frees the row. Makes RTP read true.
      --
      -- Run in the Supabase SQL editor on top of 0001-0044. Re-runnable.
      -- ============================================================================

      -- (a) Mines payout: 3% edge instead of 1%.
      create or replace function public._mines_mult(p_count int, p_revealed int)
      returns numeric
      language plpgsql
      immutable
      as $$
      declare i int; v numeric := 0.97;
      begin
        if p_revealed <= 0 then return 1; end if;
        for i in 0 .. p_revealed - 1 loop
          v := v * (25 - i)::numeric / (25 - p_count - i)::numeric;
        end loop;
        return round(v, 4);
      end;
      $$;

      grant execute on function public._mines_mult(int, int) to authenticated;

      -- (b) One-time sweep: log stale (>15 min) active rounds as losses, then close them.
      -- The stake was already deducted at start, so this only writes the missing ledger
      -- row — it does NOT touch balances.
      insert into public.casino_bets (user_id, game, bet, payout, multiplier, result)
      select user_id, game, bet, 0, 0, jsonb_build_object('abandoned', true, 'win', false)
      from public.casino_rounds
      where status = 'active' and created_at < now() - interval '15 minutes';

      update public.casino_rounds set status = 'done', ended_at = now()
      where status = 'active' and created_at < now() - interval '15 minutes';

      notify pgrst, 'reload schema';

      -- ============================================================================
      -- End of migration 0045.
      -- ============================================================================
