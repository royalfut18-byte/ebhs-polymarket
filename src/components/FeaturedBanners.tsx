"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Market, MarketStat } from "@/lib/types";
import { displayPriceYes } from "@/lib/lmsr";
import { formatCompact, toPercent } from "@/lib/format";
import { useCategoryEmoji } from "./useCategories";

// Distinct vibrant gradients (cool blue/indigo family, to match the theme).
const GRADS = [
  "linear-gradient(135deg, #0ea5e9 0%, #1e40af 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #312e81 100%)",
  "linear-gradient(135deg, #2563eb 0%, #0f766e 100%)",
];

function HeroPanel({ totals }: { totals: { markets: number; volume: number; trades: number } }) {
  return (
    <div
      className="relative flex h-40 flex-col justify-between overflow-hidden rounded-2xl p-4 ring-1 ring-white/10"
      style={{ background: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)" }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/[0.06]" />
      <div className="relative">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-sky-200/90">
          <Sparkles size={11} /> EBHS Predictions
        </span>
        <h2 className="mt-1 text-[19px] font-black leading-[1.05] text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
          Predict the future. <span className="text-sky-200">Win prizes.</span>
        </h2>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/80">
          Trade YES/NO on everything at EBHS — your trades move the market. Climb the leaderboard. 🏆
        </p>
      </div>
      <div className="relative flex items-center gap-3 text-white">
        <HeroStat label="Markets" value={totals.markets.toLocaleString()} />
        <span className="h-7 w-px bg-white/20" />
        <HeroStat label="Volume" value={`$${formatCompact(totals.volume)}`} />
        <span className="h-7 w-px bg-white/20" />
        <HeroStat label="Trades" value={totals.trades.toLocaleString()} />
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-none">
      <div className="text-sm font-black tabular-nums">{value}</div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/60">{label}</div>
    </div>
  );
}

function BannerCard({ market, stats, grad }: { market: Market; stats?: MarketStat; grad: string }) {
  const emojiOf = useCategoryEmoji();
  const img = market.image_url?.trim();
  const isUrl = img && /^https?:\/\//i.test(img);
  const pct = toPercent(displayPriceYes(market));
  const vol = Number(stats?.volume ?? 0);

  return (
    <Link
      href={`/market/${market.id}`}
      className="group relative flex h-40 overflow-hidden rounded-2xl p-4 ring-1 ring-white/10 transition-transform duration-200 hover:-translate-y-0.5"
      style={{ background: grad }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/10" />
      <div className="relative flex min-w-0 flex-1 flex-col justify-between">
        <h3 className="line-clamp-3 pr-2 text-sm font-bold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
          {market.question}
        </h3>
        <div>
          <div className="mb-2 text-[11px] font-medium text-white/75">
            {pct} chance · ${formatCompact(vol)} vol
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm transition-colors group-hover:bg-white/30">
            Trade <ArrowRight size={12} />
          </span>
        </div>
      </div>
      <div className="relative ml-2 flex w-16 shrink-0 items-center justify-center">
        {isUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-16 w-16 rounded-xl object-cover shadow-lg ring-1 ring-white/20" />
        ) : (
          <span className="text-5xl drop-shadow-lg">{img || emojiOf(market.category)}</span>
        )}
      </div>
    </Link>
  );
}

// Hero panel + the top-3 trending open markets as Polymarket-style banner cards.
export default function FeaturedBanners({
  markets,
  statsMap,
  totals,
}: {
  markets: Market[];
  statsMap: Record<string, MarketStat>;
  totals: { markets: number; volume: number; trades: number };
}) {
  const top = [...markets]
    .filter((m) => m.status === "open" && !m.group_id)
    .sort((a, b) => (Number(statsMap[b.id]?.volume) || 0) - (Number(statsMap[a.id]?.volume) || 0))
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <HeroPanel totals={totals} />
      {top.map((m, i) => (
        <BannerCard key={m.id} market={m} stats={statsMap[m.id]} grad={GRADS[i % GRADS.length]} />
      ))}
    </div>
  );
}
