"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchUserPositions, fetchUserTrades } from "@/lib/queries";
import { priceOf } from "@/lib/lmsr";
import { formatMoney, formatShares, timeAgo, toCents } from "@/lib/format";

const signedMoney = (n: number) => `${n >= 0 ? "+" : "-"}${formatMoney(Math.abs(n))}`;
import type { PositionWithMarket } from "@/lib/types";
import clsx from "clsx";

export default function PortfolioPage() {
  const { user, profile, loading } = useAuth();

  const positionsQuery = useQuery({
    queryKey: ["portfolio-positions", user?.id],
    enabled: !!user,
    queryFn: () => fetchUserPositions(user!.id),
  });
  const tradesQuery = useQuery({
    queryKey: ["user-trades", user?.id],
    enabled: !!user,
    queryFn: () => fetchUserTrades(user!.id),
  });

  if (loading) return <div className="py-20 text-center text-ink-faint">Loading…</div>;

  if (!user || !profile) {
    return (
      <div className="card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 py-14 text-center">
        <Wallet size={36} className="text-ink-faint" />
        <h1 className="text-lg font-semibold">Your portfolio</h1>
        <p className="text-sm text-ink-dim">Log in to see your positions and play-money P/L.</p>
        <Link href="/login" className="btn btn-primary">
          Log in
        </Link>
      </div>
    );
  }

  const positions = (positionsQuery.data ?? []).filter((p) => p.markets);
  const enriched = positions.map((p) => {
    const m = p.markets!;
    const price = priceOf(p.outcome, m.q_yes, m.q_no, m.b);
    const value = p.shares * price;
    const basis = p.shares * p.avg_price;
    return { p, m, price, value, basis, pnl: value - basis };
  });

  const positionsValue = enriched.reduce((s, e) => s + e.value, 0);
  const totalBasis = enriched.reduce((s, e) => s + e.basis, 0);
  const totalPnl = positionsValue - totalBasis;
  const netWorth = profile.balance + positionsValue;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Net worth" value={formatMoney(netWorth)} />
        <Stat label="Cash balance" value={formatMoney(profile.balance)} />
        <Stat label="Positions value" value={formatMoney(positionsValue)} />
        <Stat
          label="Open P/L"
          value={signedMoney(totalPnl)}
          tone={totalPnl >= 0 ? "up" : "down"}
        />
      </div>

      {/* Positions */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Open positions
        </h2>
        {positionsQuery.isLoading ? (
          <div className="card py-10 text-center text-sm text-ink-faint">Loading positions…</div>
        ) : enriched.length === 0 ? (
          <div className="card py-10 text-center text-sm text-ink-dim">
            No open positions.{" "}
            <Link href="/" className="text-brand hover:underline">
              Find a market
            </Link>{" "}
            to get started.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-medium">Market</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 text-right font-medium">Shares</th>
                  <th className="px-4 py-3 text-right font-medium">Avg</th>
                  <th className="px-4 py-3 text-right font-medium">Now</th>
                  <th className="px-4 py-3 text-right font-medium">Value</th>
                  <th className="px-4 py-3 text-right font-medium">P/L</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map(({ p, m, price, value, pnl }: any) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[240px] px-4 py-3">
                      <Link href={`/market/${m.id}`} className="line-clamp-1 hover:text-brand">
                        {m.question}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          p.outcome === "yes"
                            ? "bg-yes/15 text-yes-text"
                            : "bg-no/15 text-no-text"
                        )}
                      >
                        {p.outcome.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatShares(p.shares)}</td>
                    <td className="px-4 py-3 text-right text-ink-dim">{toCents(p.avg_price)}</td>
                    <td className="px-4 py-3 text-right">{toCents(price)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(value)}</td>
                    <td
                      className={clsx(
                        "px-4 py-3 text-right font-semibold",
                        pnl >= 0 ? "text-yes-text" : "text-no-text"
                      )}
                    >
                      {signedMoney(pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Trade history */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Trade history
        </h2>
        {(tradesQuery.data ?? []).length === 0 ? (
          <div className="card py-10 text-center text-sm text-ink-dim">No trades yet.</div>
        ) : (
          <div className="card divide-y divide-border">
            {(tradesQuery.data ?? []).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={clsx(
                    "rounded-md px-1.5 py-0.5 text-xs font-semibold capitalize",
                    t.side === "buy" ? "bg-brand/15 text-brand" : "bg-yellow-500/15 text-yellow-300"
                  )}
                >
                  {t.side}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/market/${t.market_id}`} className="line-clamp-1 hover:text-brand">
                    {t.markets?.question ?? "Market"}
                  </Link>
                  <span className="text-xs text-ink-faint">
                    {formatShares(t.shares)} {t.outcome.toUpperCase()} @ {toCents(t.shares > 0 ? t.cost / t.shares : 0)}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium">{formatMoney(t.cost)}</div>
                  <div className="text-xs text-ink-faint">{timeAgo(t.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      <div
        className={clsx(
          "mt-1 text-lg font-bold",
          tone === "up" ? "text-yes-text" : tone === "down" ? "text-no-text" : "text-ink"
        )}
      >
        {value}
      </div>
    </div>
  );
}
