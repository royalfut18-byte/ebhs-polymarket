"use client";

import type { Position, Profile } from "@/lib/types";
import { formatShares } from "@/lib/format";
import Avatar from "./Avatar";
import clsx from "clsx";

type HolderRow = Position & { profiles: Pick<Profile, "username" | "display_name"> | null };

export default function Holders({ holders }: { holders: HolderRow[] }) {
  if (holders.length === 0) {
    return <div className="py-10 text-center text-sm text-ink-faint">No holders yet.</div>;
  }

  return (
    <ul className="divide-y divide-border">
      {holders.map((h) => {
        const name = h.profiles?.display_name || h.profiles?.username || "Someone";
        const isYes = h.outcome === "yes";
        return (
          <li key={h.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={name} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{name}</div>
            </div>
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                isYes ? "bg-yes/15 text-yes-text" : "bg-no/15 text-no-text"
              )}
            >
              {h.outcome.toUpperCase()}
            </span>
            <div className="w-20 shrink-0 text-right text-sm font-semibold text-ink">
              {formatShares(h.shares)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
