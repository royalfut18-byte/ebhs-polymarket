"use client";

import Link from "next/link";
import type { TradeWithProfile } from "@/lib/types";
import { formatMoney, formatShares, timeAgo, toCents } from "@/lib/format";
import Avatar from "./Avatar";
import clsx from "clsx";

export default function ActivityFeed({ trades }: { trades: TradeWithProfile[] }) {
  const rows = [...trades].reverse().slice(0, 40);

  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-ink-faint">No trades yet. Be the first!</div>;
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((t) => {
        const username = t.profiles?.username || "someone";
        const avg = t.shares > 0 ? t.cost / t.shares : 0;
        const isYes = t.outcome === "yes";
        const isBuy = t.side === "buy";
        return (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={username} size={30} />
            <div className="min-w-0 flex-1 text-sm">
              <Link href={`/u/${username}`} className="font-medium text-ink hover:text-brand">
                @{username}
              </Link>{" "}
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-[11px] font-bold uppercase",
                  isBuy ? "bg-brand/15 text-brand" : "bg-yellow-500/15 text-yellow-300"
                )}
              >
                {isBuy ? "Buy" : "Sell"}
              </span>{" "}
              <span className={clsx("font-semibold", isYes ? "text-yes-text" : "text-no-text")}>
                {formatShares(t.shares)} {t.outcome.toUpperCase()}
              </span>{" "}
              <span className="text-ink-dim">@ {toCents(avg)}</span>
            </div>
            <div className="shrink-0 text-right text-xs">
              <div className="font-medium text-ink">{formatMoney(t.cost)}</div>
              <div className="text-ink-faint">{timeAgo(t.created_at)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
