"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { fetchCasinoHistory } from "@/lib/queries";
import type { CasinoGame } from "@/lib/types";
import clsx from "clsx";

// A horizontal strip of the player's most recent multipliers for one game.
export default function RecentResults({ game }: { game: CasinoGame }) {
  const { user } = useAuth();
  const { data = [] } = useQuery({
    queryKey: ["casino-history", user?.id, game],
    enabled: !!user,
    queryFn: () => fetchCasinoHistory(user!.id, game, 16),
  });

  if (!user || data.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-ink-faint">Recent</span>
      {data.map((b) => {
        // Colour by NET result, not just any return: a sub-1× return (e.g. low
        // Plinko buckets) pays out > 0 but is still a net loss.
        const lostAll = b.payout <= 0;
        const netWin = b.payout > b.bet;
        return (
          <span
            key={b.id}
            className={clsx(
              "shrink-0 rounded-lg px-2 py-1 text-xs font-bold tabular-nums",
              netWin ? "bg-yes/15 text-yes-text" : lostAll ? "bg-no/15 text-no-text" : "bg-amber-500/15 text-amber-300"
            )}
          >
            {lostAll ? "✕" : `${b.multiplier.toFixed(2)}×`}
          </span>
        );
      })}
    </div>
  );
}
