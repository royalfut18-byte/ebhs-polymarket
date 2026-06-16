"use client";

import type { TradeWithProfile } from "@/lib/types";
import { formatCredits, formatShares, timeAgo, toCents } from "@/lib/format";
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
        const name = t.profiles?.display_name || t.profiles?.username || "Someone";
        const avg = t.shares > 0 ? t.cost / t.shares : 0;
        const isYes = t.outcome === "yes";
        return (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={name} size={30} />
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium text-ink">{name}</span>{" "}
              <span className="text-ink-dim">{t.side === "buy" ? "bought" : "sold"}</span>{" "}
              <span className={clsx("font-semibold", isYes ? "text-yes-text" : "text-no-text")}>
                {formatShares(t.shares)} {t.outcome.toUpperCase()}
              </span>{" "}
              <span className="text-ink-dim">@ {toCents(avg)}</span>
            </div>
            <div className="shrink-0 text-right text-xs">
              <div className="font-medium text-ink">{formatCredits(t.cost)} cr</div>
              <div className="text-ink-faint">{timeAgo(t.created_at)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
