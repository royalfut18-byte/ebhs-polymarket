"use client";

import Link from "next/link";
import type { Market, Position, Profile } from "@/lib/types";
import { priceOf } from "@/lib/lmsr";
import { formatMoney, formatShares, signedMoney } from "@/lib/format";
import Avatar from "./Avatar";
import clsx from "clsx";

type HolderRow = Position & { profiles: Pick<Profile, "username"> | null };

export default function Holders({ holders, market }: { holders: HolderRow[]; market: Market }) {
  if (holders.length === 0) {
    return <div className="py-10 text-center text-sm text-ink-faint">No holders yet.</div>;
  }

  return (
    <ul className="divide-y divide-border">
      {holders.map((h) => {
        const username = h.profiles?.username || "someone";
        const isYes = h.outcome === "yes";
        const price = priceOf(h.outcome, market.q_yes, market.q_no, market.b);
        const value = h.shares * price;
        const pnl = value - h.shares * h.avg_price;
        const up = pnl >= 0;
        return (
          <li key={h.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={username} size={30} />
            <div className="min-w-0 flex-1">
              <Link
                href={`/u/${username}`}
                className="block truncate text-sm font-medium text-ink hover:text-brand"
              >
                @{username}
              </Link>
              <div className="text-xs text-ink-faint">
                {formatShares(h.shares)} shares · {formatMoney(value)}
              </div>
            </div>
            <span
              className={clsx(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                isYes ? "bg-yes/15 text-yes-text" : "bg-no/15 text-no-text"
              )}
            >
              {h.outcome.toUpperCase()}
            </span>
            <div className="w-[76px] shrink-0 text-right">
              <div
                className={clsx(
                  "text-sm font-semibold tabular-nums",
                  up ? "text-yes-text" : "text-no-text"
                )}
              >
                {signedMoney(pnl)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">P/L</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
