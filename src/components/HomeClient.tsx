"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { fetchMarkets, fetchMarketStats } from "@/lib/queries";
import type { Market } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import { formatCompact } from "@/lib/format";
import MarketCard from "./MarketCard";
import CategoryPills from "./CategoryPills";
import { AnimatedNumber, FadeIn, Stagger, StaggerItem } from "./motion";

const STATUS_RANK: Record<string, number> = { open: 0, closed: 1, resolved: 2, cancelled: 3 };

export default function HomeClient() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const [category, setCategory] = useState("All");

  const marketsQuery = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets });
  const statsQuery = useQuery({ queryKey: ["market-stats"], queryFn: fetchMarketStats });

  const allMarkets: Market[] = marketsQuery.data ?? [];
  const statsMap = statsQuery.data ?? {};

  const totals = useMemo(() => {
    let volume = 0;
    let trades = 0;
    for (const m of allMarkets) {
      const s = statsMap[m.id];
      if (s) {
        volume += Number(s.volume) || 0;
        trades += Number(s.trade_count) || 0;
      }
    }
    return { markets: allMarkets.length, volume, trades };
  }, [allMarkets, statsMap]);

  const categoryList = useMemo(() => {
    const preset = CATEGORIES as readonly string[];
    const extras = Array.from(new Set(allMarkets.map((m) => m.category))).filter(
      (c) => c && !preset.includes(c)
    );
    return [...preset, ...extras.sort()];
  }, [allMarkets]);

  const markets = useMemo(() => {
    return allMarkets
      .filter((m) => (category === "All" ? true : m.category === category))
      .filter((m) => {
        if (!q) return true;
        return (
          m.question.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
        if (r !== 0) return r;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [allMarkets, category, q]);

  return (
    <div className="flex flex-col gap-6">
      {!q && (
        <FadeIn>
          <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-7 sm:p-10">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-float rounded-full bg-brand/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 top-10 h-64 w-64 rounded-full bg-accent-violet/15 blur-3xl" />
            <div className="relative max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-xs font-medium text-ink-dim">
                <Sparkles size={13} className="text-brand-light" /> Play-money prediction market
              </span>
              <h1 className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                Predict the future. <br className="hidden sm:block" />
                <span className="text-gradient">Win prizes.</span>
              </h1>
              <p className="mt-3 max-w-lg text-sm text-ink-dim sm:text-base">
                Trade YES/NO on everything happening at EBHS. Prices are live probabilities — your
                trades move the market. Climb the leaderboard. 🏆
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#markets" className="btn btn-primary">
                  <TrendingUp size={16} /> Browse markets
                </a>
                <Link href="/suggest" className="btn btn-ghost">
                  <Lightbulb size={16} /> Suggest a market
                </Link>
              </div>

              <div className="mt-8 flex gap-8">
                <Stat label="Markets" value={totals.markets} />
                <Stat label="Volume" value={totals.volume} prefix="$" compact />
                <Stat label="Trades" value={totals.trades} />
              </div>
            </div>
          </section>
        </FadeIn>
      )}

      <div id="markets" className="scroll-mt-20 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold tracking-tight">
            {q ? <>Results for “{q}”</> : "All markets"}
          </h2>
        </div>

        <CategoryPills active={category} onChange={setCategory} categories={categoryList} />

        {marketsQuery.isError ? (
          <ErrorState />
        ) : marketsQuery.isLoading ? (
          <Skeletons />
        ) : markets.length === 0 ? (
          <EmptyState />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {markets.map((m) => (
              <StaggerItem key={m.id}>
                <MarketCard market={m} stats={statsMap[m.id]} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  prefix = "",
  compact = false,
}: {
  label: string;
  value: number;
  prefix?: string;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="text-2xl font-bold tracking-tight sm:text-3xl">
        {prefix}
        <AnimatedNumber
          value={value}
          format={(n) => (compact ? formatCompact(n) : Math.round(n).toLocaleString("en-US"))}
        />
      </div>
      <div className="text-xs font-medium uppercase tracking-widest text-ink-faint">{label}</div>
    </div>
  );
}

function Skeletons() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card flex flex-col gap-3 p-4">
          <div className="flex gap-3">
            <div className="skeleton h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          </div>
          <div className="skeleton h-2 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-2">
            <div className="skeleton h-9" />
            <div className="skeleton h-9" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-3 py-16 text-center">
      <Inbox size={40} className="text-ink-faint" />
      <div className="text-lg font-semibold">No markets here yet</div>
      <p className="max-w-sm text-sm text-ink-dim">
        Try another category, or{" "}
        <Link href="/suggest" className="text-brand-light hover:underline">
          suggest a market
        </Link>{" "}
        for the admins to add.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="card flex flex-col items-center gap-3 py-16 text-center">
      <Inbox size={40} className="text-no-text" />
      <div className="text-lg font-semibold">Couldn&apos;t load markets</div>
      <p className="max-w-sm text-sm text-ink-dim">
        Check that your Supabase keys are set and the SQL migrations have been run.
      </p>
    </div>
  );
}
