"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, CalendarClock, Users } from "lucide-react";
import { fetchMarket, fetchMarketHolders, fetchMarketTrades } from "@/lib/queries";
import { categoryEmoji } from "@/lib/categories";
import { formatCompact, formatDate } from "@/lib/format";
import type { Market } from "@/lib/types";
import PriceChart from "./PriceChart";
import TradePanel from "./TradePanel";
import ActivityFeed from "./ActivityFeed";
import Holders from "./Holders";
import Comments from "./Comments";
import StatusBadge from "./StatusBadge";
import { FadeIn } from "./motion";
import clsx from "clsx";

type Tab = "activity" | "holders" | "comments";

export default function MarketDetail({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>("activity");

  const marketQuery = useQuery({
    queryKey: ["market", id],
    queryFn: () => fetchMarket(id),
    refetchInterval: 5000, // keep prices live as others trade
  });
  const tradesQuery = useQuery({
    queryKey: ["trades", id],
    queryFn: () => fetchMarketTrades(id),
    refetchInterval: 5000,
  });
  const holdersQuery = useQuery({
    queryKey: ["holders", id],
    queryFn: () => fetchMarketHolders(id),
  });

  const trades = tradesQuery.data ?? [];
  const stats = useMemo(() => {
    const volume = trades.reduce((s, t) => s + Math.abs(t.cost), 0);
    const traders = new Set(trades.map((t) => t.user_id)).size;
    return { volume, traders };
  }, [trades]);

  if (marketQuery.isLoading) {
    return <div className="py-20 text-center text-ink-faint">Loading market…</div>;
  }
  if (marketQuery.isError || !marketQuery.data) {
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-center">
        <div className="text-lg font-semibold">Market not found</div>
        <Link href="/" className="btn btn-ghost">
          Back to markets
        </Link>
      </div>
    );
  }

  const market: Market = marketQuery.data;
  const img = market.image_url?.trim();
  const isUrl = img && /^https?:\/\//i.test(img);

  return (
    <FadeIn className="flex flex-col gap-5">
      <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-dim hover:text-ink">
        <ArrowLeft size={16} /> Markets
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        {isUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-16 w-16 rounded-xl object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-bg-card text-4xl">
            {img || categoryEmoji(market.category)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
            <span className="rounded-full bg-bg-card px-2.5 py-1">{market.category}</span>
            <StatusBadge status={market.status} resolution={market.resolution} />
          </div>
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{market.question}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1">
              <BarChart3 size={13} /> {`$${formatCompact(stats.volume)} volume`}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={13} /> {stats.traders} traders
            </span>
            {market.close_at && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={13} /> Closes {formatDate(market.close_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: chart + details + tabs */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <PriceChart market={market} trades={trades} />

          {market.description && (
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                About
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">
                {market.description}
              </p>
            </div>
          )}

          <div className="card p-4">
            <div className="mb-3 flex gap-1 rounded-xl bg-bg-soft p-1">
              {(["activity", "holders", "comments"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={clsx(
                    "flex-1 rounded-lg py-1.5 text-sm font-semibold capitalize transition-colors",
                    tab === t ? "bg-bg-hover text-ink" : "text-ink-faint hover:text-ink"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "activity" && <ActivityFeed trades={trades} />}
            {tab === "holders" && <Holders holders={holdersQuery.data ?? []} />}
            {tab === "comments" && <Comments marketId={market.id} />}
          </div>
        </div>

        {/* Right: trade panel */}
        <div className="lg:col-span-1">
          <TradePanel market={market} />
        </div>
      </div>
    </FadeIn>
  );
}
