"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { fetchMarkets, fetchUserPositions } from "@/lib/queries";
import { enrichPositions, summarize } from "@/lib/pnl";
import { formatMoney, signedMoney, signedPct } from "@/lib/format";
import clsx from "clsx";
import type { Market } from "@/lib/types";

export default function NavPortfolio() {
  const { user, profile } = useAuth();
  const { data: positions } = useQuery({
    queryKey: ["portfolio-positions", user?.id],
    enabled: !!user,
    queryFn: () => fetchUserPositions(user!.id),
    refetchInterval: 5000,
  });
  const marketsQuery = useQuery({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    refetchInterval: 5000,
  });
  const liveMarkets = useMemo(
    () =>
      Object.fromEntries(
        (marketsQuery.data ?? []).map((market) => [market.id, market] as const)
      ) as Record<string, Market>,
    [marketsQuery.data]
  );

  if (!profile) return null;

  const s = summarize(enrichPositions(positions ?? [], liveMarkets), profile.balance);
  const up = s.totalPnl >= 0;

  return (
    <>
      <Link
        href="/portfolio"
        className="hidden items-stretch overflow-hidden rounded-xl border border-border bg-bg-soft text-sm transition-colors hover:border-border-soft lg:flex"
        title={`Holdings ${formatMoney(s.positionsValue)} | Cash ${formatMoney(profile.balance)} | Net worth ${formatMoney(s.netWorth)}`}
      >
        <div className="flex flex-col items-end px-3 py-1 leading-tight">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
            Holdings
          </span>
          <span className="font-bold tabular-nums text-ink">{formatMoney(s.positionsValue)}</span>
        </div>
        <div
          className={clsx(
            "flex flex-col items-end justify-center px-3 py-1 leading-tight",
            up ? "bg-yes/10" : "bg-no/10"
          )}
        >
          <span
            className={clsx(
              "flex items-center gap-0.5 text-xs font-bold tabular-nums",
              up ? "text-yes-text" : "text-no-text"
            )}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {signedMoney(s.totalPnl)}
          </span>
          <span className={clsx("text-[10px] tabular-nums", up ? "text-yes-text" : "text-no-text")}>
            {signedPct(s.totalPct)}
          </span>
        </div>
      </Link>

      <Link
        href="/portfolio"
        className={clsx(
          "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold tabular-nums lg:hidden",
          up ? "border-yes/30 bg-yes/10 text-yes-text" : "border-no/30 bg-no/10 text-no-text"
        )}
        title={`Holdings ${formatMoney(s.positionsValue)} | Net worth ${formatMoney(s.netWorth)}`}
      >
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {signedMoney(s.totalPnl)}
      </Link>
    </>
  );
}
