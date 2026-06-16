"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { fetchMarkets, fetchMarketStats } from "@/lib/queries";
import type { Market } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import MarketCard from "./MarketCard";
import CategoryPills from "./CategoryPills";

const STATUS_RANK: Record<string, number> = { open: 0, closed: 1, resolved: 2, cancelled: 3 };

export default function HomeClient() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const [category, setCategory] = useState("All");

  const marketsQuery = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets });
  const statsQuery = useQuery({ queryKey: ["market-stats"], queryFn: fetchMarketStats });

  // Category pills = the presets, plus any custom categories that exist on markets.
  const categoryList = useMemo(() => {
    const all: Market[] = marketsQuery.data ?? [];
    const preset = CATEGORIES as readonly string[];
    const extras = Array.from(new Set(all.map((m) => m.category))).filter(
      (c) => c && !preset.includes(c)
    );
    return [...preset, ...extras.sort()];
  }, [marketsQuery.data]);

  const markets = useMemo(() => {
    const all: Market[] = marketsQuery.data ?? [];
    return all
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
  }, [marketsQuery.data, category, q]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {q ? <>Results for “{q}”</> : "Markets"}
        </h1>
        <p className="text-sm text-ink-dim">
          Predict the future now on EBHS Polymarket to win prizes! 🏆
        </p>
      </div>

      <CategoryPills active={category} onChange={setCategory} categories={categoryList} />

      {marketsQuery.isError ? (
        <ErrorState />
      ) : marketsQuery.isLoading ? (
        <Skeletons />
      ) : markets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} stats={statsQuery.data?.[m.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card h-56 animate-pulse p-4">
          <div className="h-11 w-11 rounded-lg bg-bg-hover" />
          <div className="mt-3 h-4 w-3/4 rounded bg-bg-hover" />
          <div className="mt-2 h-4 w-1/2 rounded bg-bg-hover" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-3 py-16 text-center">
      <Inbox size={40} className="text-ink-faint" />
      <div className="text-lg font-semibold">No markets yet</div>
      <p className="max-w-sm text-sm text-ink-dim">
        Once an admin creates markets (or you run the seed script), they&apos;ll show up here.
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
        Check that your Supabase keys are set in <code>.env.local</code> and the SQL migration has
        been run.
      </p>
    </div>
  );
}
