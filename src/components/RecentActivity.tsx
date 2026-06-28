"use client";

import { useQuery } from "@tanstack/react-query";
import { Coins, Dice5, Swords, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { fetchRecentActivity } from "@/lib/queries";
import { formatMoney, timeAgo } from "@/lib/format";
import Avatar from "./Avatar";
import type { ActivityItem } from "@/lib/types";

const GAME_LABEL: Record<string, string> = {
  dice: "Dice",
  crash: "Crash",
  mines: "Mines",
  plinko: "Plinko",
  limbo: "Limbo",
  blackjack: "Blackjack",
  roulette: "Roulette",
  hilo: "Hi-Lo",
  baccarat: "Baccarat",
  chess: "chess",
  uno: "Uno",
  pool: "pool",
};

function describe(a: ActivityItem): { icon: React.ReactNode; text: React.ReactNode } {
  if (a.kind === "casino") {
    const game = GAME_LABEL[a.game ?? ""] ?? a.game;
    if (a.won) {
      return {
        icon: <Coins size={15} className="text-yes-text" />,
        text: (
          <>
            won <span className="font-semibold text-yes-text">{formatMoney(a.payout ?? 0)}</span> on {game}
          </>
        ),
      };
    }
    return {
      icon: <Dice5 size={15} className="text-no-text" />,
      text: (
        <>
          lost <span className="font-semibold text-no-text">{formatMoney(a.bet ?? 0)}</span> on {game}
        </>
      ),
    };
  }
  if (a.kind === "trade") {
    const buy = a.side === "buy";
    const side = a.outcome === "yes" ? "YES" : "NO";
    return {
      icon: buy ? <TrendingUp size={15} className="text-yes-text" /> : <TrendingDown size={15} className="text-no-text" />,
      text: (
        <>
          {buy ? "bought" : "sold"} {Math.round(a.shares ?? 0)}{" "}
          <span className={a.outcome === "yes" ? "font-semibold text-yes-text" : "font-semibold text-no-text"}>{side}</span> on{" "}
          <span className="text-ink">“{a.market}”</span>
        </>
      ),
    };
  }
  // arena
  const game = GAME_LABEL[a.game ?? ""] ?? a.game;
  if (a.outcome === "win") {
    return {
      icon: <Trophy size={15} className="text-yellow-300" />,
      text: (
        <>
          won a {game} match <span className="text-ink-faint">(+{formatMoney(a.pot ?? 0)})</span>
        </>
      ),
    };
  }
  if (a.outcome === "draw") {
    return { icon: <Swords size={15} className="text-ink-faint" />, text: <>drew a {game} match</> };
  }
  return { icon: <Swords size={15} className="text-no-text" />, text: <>lost a {game} match</> };
}

export default function RecentActivity() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => fetchRecentActivity(10),
    refetchInterval: 12000,
  });

  if (!isLoading && items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">Recent activity</h2>
      </div>
      <div className="card divide-y divide-border p-0">
        {isLoading ? (
          <div className="px-4 py-6 text-center text-sm text-ink-faint">Loading…</div>
        ) : (
          items.map((a, i) => {
            const { icon, text } = describe(a);
            return (
              <div key={`${a.kind}-${a.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={a.username} size={28} />
                <span className="shrink-0">{icon}</span>
                <div className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-semibold">@{a.username}</span> <span className="text-ink-dim">{text}</span>
                </div>
                <span className="shrink-0 text-xs text-ink-faint">{timeAgo(a.at)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
