"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Flame, Inbox, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { fetchMarkets, fetchMarketStats, fetchRetiredStats } from "@/lib/queries";
import type { Market, MarketStat, MarketStatus } from "@/lib/types";
import { formatCompact, toCents, toPercent } from "@/lib/format";
import { displayPriceYes } from "@/lib/lmsr";
import MarketCard from "./MarketCard";
import GroupedMarketCard from "./GroupedMarketCard";
import CategoryPills from "./CategoryPills";
import AnnouncementBanner from "./AnnouncementBanner";
import RecentActivity from "./RecentActivity";
import { useCategories, useCategoryEmoji } from "./useCategories";
import { AnimatedNumber, FadeIn, Stagger, StaggerItem, motion } from "./motion";
import clsx from "clsx";

const STATUS_RANK: Record<string, number> = { open: 0, closed: 1, resolved: 2, cancelled: 3 };

type DisplayItem =
  | { kind: "single"; market: Market }
  | {
      kind: "group";
      groupId: string;
      title: string;
      category: string;
      imageUrl: string | null;
      status: MarketStatus;
      options: Market[];
      created: number;
    };

export default function HomeClient() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const [category, setCategory] = useState("All");

  const marketsQuery = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets });
  const statsQuery = useQuery({ queryKey: ["market-stats"], queryFn: fetchMarketStats });
  const retiredQuery = useQuery({ queryKey: ["retired-stats"], queryFn: fetchRetiredStats });
  const categories = useCategories();

  const allMarkets: Market[] = marketsQuery.data ?? [];
  const statsMap = statsQuery.data ?? {};
  const retired = retiredQuery.data ?? { volume: 0, trades: 0 };

  // The "hottest" market = highest-volume open standalone market.
  const trending = useMemo(() => {
    const open = allMarkets.filter((m) => m.status === "open" && !m.group_id);
    if (!open.length) return null;
    return [...open].sort(
      (a, b) => (Number(statsMap[b.id]?.volume) || 0) - (Number(statsMap[a.id]?.volume) || 0)
    )[0];
  }, [allMarkets, statsMap]);

  const totals = useMemo(() => {
    let volume = 0;
    let trades = 0;
    let singles = 0;
    const groups = new Set<string>();
    for (const m of allMarkets) {
      const s = statsMap[m.id];
      if (s) {
        volume += Number(s.volume) || 0;
        trades += Number(s.trade_count) || 0;
      }
      if (m.group_id) groups.add(m.group_id);
      else singles++;
    }
    // Fold in activity banked from deleted markets so totals never drop.
    return {
      markets: singles + groups.size,
      volume: volume + retired.volume,
      trades: trades + retired.trades,
    };
  }, [allMarkets, statsMap, retired]);

  const categoryList = useMemo(() => {
    const names = categories.map((c) => c.name);
    const known = new Set<string>(["All", ...names]);
    const extras = Array.from(new Set(allMarkets.map((m) => m.category))).filter(
      (c) => c && !known.has(c)
    );
    return ["All", ...names, ...extras.sort()];
  }, [categories, allMarkets]);

  const items = useMemo<DisplayItem[]>(() => {
    const filtered = allMarkets
      .filter((m) => (category === "All" ? true : m.category === category))
      .filter((m) => {
        if (!q) return true;
        return (
          m.question.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          (m.group_title?.toLowerCase().includes(q) ?? false) ||
          (m.option_label?.toLowerCase().includes(q) ?? false)
        );
      });

    const groupsMap = new Map<string, Market[]>();
    const list: DisplayItem[] = [];
    for (const m of filtered) {
      if (m.group_id) {
        const arr = groupsMap.get(m.group_id);
        if (arr) arr.push(m);
        else groupsMap.set(m.group_id, [m]);
      } else {
        list.push({ kind: "single", market: m });
      }
    }
    for (const [gid, opts] of groupsMap) {
      const rep = opts[0];
      const status: MarketStatus = opts.some((o) => o.status === "open") ? "open" : rep.status;
      const created = Math.max(...opts.map((o) => new Date(o.created_at).getTime()));
      list.push({
        kind: "group",
        groupId: gid,
        title: rep.group_title ?? rep.question,
        category: rep.category,
        imageUrl: rep.image_url,
        status,
        options: opts,
        created,
      });
    }

    return list.sort((a, b) => {
      const sa = a.kind === "single" ? a.market.status : a.status;
      const sb = b.kind === "single" ? b.market.status : b.status;
      const r = (STATUS_RANK[sa] ?? 9) - (STATUS_RANK[sb] ?? 9);
      if (r !== 0) return r;
      const ta = a.kind === "single" ? new Date(a.market.created_at).getTime() : a.created;
      const tb = b.kind === "single" ? new Date(b.market.created_at).getTime() : b.created;
      return tb - ta;
    });
  }, [allMarkets, category, q]);

  return (
    <div className="flex flex-col gap-6">
      {!q && <AnnouncementBanner />}
      {!q && (
        <FadeIn>
          <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-7 sm:p-10">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-float rounded-full bg-brand/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 top-10 h-64 w-64 rounded-full bg-accent-violet/15 blur-3xl" />
            <div
              className={clsx(
                "relative grid gap-8",
                trending && "lg:grid-cols-2"
              )}
            >
              <div className="max-w-2xl">
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
                <div className="mt-6 flex flex-wrap items-center gap-3">
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

              {trending && <FeaturedMarket market={trending} stats={statsMap[trending.id]} />}
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
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((it) =>
              it.kind === "single" ? (
                <StaggerItem key={it.market.id}>
                  <MarketCard market={it.market} stats={statsMap[it.market.id]} />
                </StaggerItem>
              ) : (
                <StaggerItem key={it.groupId}>
                  <GroupedMarketCard
                    groupId={it.groupId}
                    title={it.title}
                    category={it.category}
                    imageUrl={it.imageUrl}
                    status={it.status}
                    options={it.options}
                    statsMap={statsMap}
                  />
                </StaggerItem>
              )
            )}
          </Stagger>
        )}
      </div>

      {!q && <RecentActivity />}
    </div>
  );
}

function FeaturedMarket({ market, stats }: { market: Market; stats?: MarketStat }) {
  const router = useRouter();
  const emojiOf = useCategoryEmoji();
  const pYes = displayPriceYes(market);
  const pNo = 1 - pYes;
  const img = market.image_url?.trim();
  const isUrl = img && /^https?:\/\//i.test(img);
  const tradable = market.status === "open";
  const href = `/market/${market.id}`;
  const go = (o?: "yes" | "no") => router.push(o ? `${href}?o=${o}` : href);

  return (
    <motion.div
      onClick={() => go()}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative flex h-full min-h-[340px] w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-orange-400/30 bg-gradient-to-br from-orange-500/[0.16] via-bg-card/70 to-bg-card/90 p-6 shadow-[0_24px_70px_-28px_rgba(251,146,60,0.6)] backdrop-blur sm:p-7"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-orange-500/25 blur-3xl" />

      <div className="relative flex items-center gap-2 text-orange-300">
        <Flame size={17} className="animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider">🔥 Trending now</span>
      </div>

      <div className="relative mt-4 flex items-start gap-4">
        {isUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-border" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-3xl ring-1 ring-border">
            {img || emojiOf(market.category)}
          </div>
        )}
        <h3 className="text-lg font-bold leading-snug text-ink sm:text-2xl">{market.question}</h3>
      </div>

      {market.description && (
        <p className="relative mt-3 line-clamp-2 text-sm text-ink-dim">{market.description}</p>
      )}

      <div className="relative mt-auto pt-6">
        <div className="flex items-end justify-between">
          <div>
            <div
              className={clsx(
                "text-5xl font-bold leading-none",
                pYes >= 0.5 ? "text-yes-text" : "text-no-text"
              )}
            >
              {toPercent(pYes)}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
              chance
            </div>
          </div>
          <div className="text-right text-xs text-ink-faint">
            <div className="font-medium text-ink-dim">{`$${formatCompact(stats?.volume ?? 0)} vol`}</div>
            <div>{stats?.trader_count ?? 0} traders</div>
          </div>
        </div>

        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-no/25">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yes to-yes-text"
            style={{ width: `${pYes * 100}%` }}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            disabled={!tradable}
            onClick={(e) => {
              e.stopPropagation();
              go("yes");
            }}
            className={clsx("btn btn-yes py-2.5 text-[15px]", !tradable && "pointer-events-none opacity-50")}
          >
            Yes <span className="opacity-70">{toCents(pYes)}</span>
          </button>
          <button
            disabled={!tradable}
            onClick={(e) => {
              e.stopPropagation();
              go("no");
            }}
            className={clsx("btn btn-no py-2.5 text-[15px]", !tradable && "pointer-events-none opacity-50")}
          >
            No <span className="opacity-70">{toCents(pNo)}</span>
          </button>
        </div>
      </div>
    </motion.div>
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
