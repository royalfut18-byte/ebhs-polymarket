"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchUserPositions, fetchUserTrades } from "@/lib/queries";
import { enrichPositions, summarize, STARTING_BALANCE } from "@/lib/pnl";
import { formatMoney, formatShares, signedMoney, signedPct, timeAgo, toCents } from "@/lib/format";
import PositionsTable from "@/components/PositionsTable";
import { AnimatedNumber, FadeIn } from "@/components/motion";
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

  const enriched = enrichPositions(positionsQuery.data ?? []);
  const s = summarize(enriched, profile.balance);
  const up = s.totalPnl >= 0;

  return (
    <FadeIn className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>

      {/* Hero: net worth + all-time P/L */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Portfolio value
          </div>
          <div className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            <AnimatedNumber value={s.netWorth} format={formatMoney} />
          </div>
          <div className="mt-1 text-xs text-ink-faint">
            {formatMoney(profile.balance)} cash + {formatMoney(s.positionsValue)} in positions
          </div>
        </div>

        <div
          className={clsx(
            "card relative overflow-hidden p-5",
            up ? "border-yes/30" : "border-no/30"
          )}
        >
          <div
            className={clsx(
              "pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl",
              up ? "bg-yes/20" : "bg-no/20"
            )}
          />
          <div className="relative flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-ink-faint">
            All-time profit / loss
            {up ? (
              <TrendingUp size={14} className="text-yes-text" />
            ) : (
              <TrendingDown size={14} className="text-no-text" />
            )}
          </div>
          <div
            className={clsx(
              "relative mt-1 text-3xl font-bold tracking-tight sm:text-4xl",
              up ? "text-yes-text" : "text-no-text"
            )}
          >
            <AnimatedNumber value={s.totalPnl} format={(n) => signedMoney(n)} />
          </div>
          <div className={clsx("relative mt-1 text-xs", up ? "text-yes-text" : "text-no-text")}>
            {signedPct(s.totalPct)} · started with {formatMoney(STARTING_BALANCE)}
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Cash" value={formatMoney(profile.balance)} />
        <Stat label="Invested" value={formatMoney(s.basis)} />
        <Stat
          label="Open P/L"
          value={signedMoney(s.openPnl)}
          tone={s.openPnl >= 0 ? "up" : "down"}
        />
      </div>

      {/* Positions */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Open positions
        </h2>
        {positionsQuery.isLoading ? (
          <div className="card py-10 text-center text-sm text-ink-faint">Loading positions…</div>
        ) : (
          <PositionsTable rows={enriched} />
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
                    t.side === "buy" ? "bg-brand/15 text-brand-light" : "bg-yellow-500/15 text-yellow-300"
                  )}
                >
                  {t.side}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/market/${t.market_id}`} className="line-clamp-1 hover:text-brand">
                    {t.markets?.question ?? "Market"}
                  </Link>
                  <span className="text-xs text-ink-faint">
                    {formatShares(t.shares)} {t.outcome.toUpperCase()} @{" "}
                    {toCents(t.shares > 0 ? t.cost / t.shares : 0)}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium tabular-nums">{formatMoney(t.cost)}</div>
                  <div className="text-xs text-ink-faint">{timeAgo(t.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </FadeIn>
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
          "mt-1 text-lg font-bold tabular-nums",
          tone === "up" ? "text-yes-text" : tone === "down" ? "text-no-text" : "text-ink"
        )}
      >
        {value}
      </div>
    </div>
  );
}
