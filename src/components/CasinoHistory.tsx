"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCasinoHistory } from "@/lib/queries";
import { GAME_BY_SLUG } from "@/lib/casino/games";
import { formatMoney, signedMoney, timeAgo } from "@/lib/format";
import GameIcon from "./casino/GameIcon";
import clsx from "clsx";

// The player's recent casino bets, for the portfolio page. Uses the same query
// key the casino hook invalidates, so it stays in sync after each bet.
export default function CasinoHistory({ userId }: { userId: string }) {
  const { data: bets = [], isLoading } = useQuery({
    queryKey: ["casino-history", userId],
    queryFn: () => fetchCasinoHistory(userId, undefined, 50),
  });

  if (isLoading) {
    return <div className="card py-10 text-center text-sm text-ink-faint">Loading casino history…</div>;
  }
  if (bets.length === 0) {
    return (
      <div className="card py-10 text-center text-sm text-ink-dim">
        No casino bets yet. Try your luck in the{" "}
        <a href="/casino" className="text-brand-light hover:underline">
          casino
        </a>
        .
      </div>
    );
  }

  return (
    <div className="card divide-y divide-border">
      {bets.map((b) => {
        const meta = GAME_BY_SLUG[b.game];
        const net = Number(b.payout) - Number(b.bet);
        const won = Number(b.payout) > 0;
        return (
          <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <GameIcon game={b.game} size={30} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">{meta?.name ?? b.game}</div>
              <div className="text-xs text-ink-faint">
                Bet {formatMoney(b.bet)}
                {won && b.multiplier > 0 && (
                  <span className="ml-1 text-ink-dim">· {Number(b.multiplier).toFixed(2)}×</span>
                )}
              </div>
            </div>
            <span
              className={clsx(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                won ? "bg-yes/15 text-yes-text" : "bg-no/15 text-no-text"
              )}
            >
              {won ? "Won" : "Lost"}
            </span>
            <div className="w-[84px] shrink-0 text-right">
              <div
                className={clsx(
                  "font-semibold tabular-nums",
                  net >= 0 ? "text-yes-text" : "text-no-text"
                )}
              >
                {signedMoney(net)}
              </div>
              <div className="text-[10px] text-ink-faint">{timeAgo(b.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
