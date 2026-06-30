"use client";

import Link from "next/link";
import { Flame, Trophy } from "lucide-react";
import type { Market, MarketStat } from "@/lib/types";
import { displayPriceYes } from "@/lib/lmsr";
import { formatCompact, toCents, toPercent } from "@/lib/format";
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
      className="relative flex h-44 flex-col justify-between overflow-hidden rounded-2xl p-4 ring-1 ring-white/10"
      style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #1d4ed8 100%)" }}
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-sky-400/25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-indigo-500/30 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/[0.07]" />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">
          <Trophy size={11} /> EBHS Predictions
        </span>
        <h2 className="mt-2.5 text-[22px] font-black leading-[1.04] tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
          Predict the future.
          <br />
          <span className="bg-gradient-to-r from-sky-200 to-cyan-200 bg-clip-text text-transparent">
            Win prizes.
          </span>
        </h2>
      </div>
      <div className="relative flex items-center gap-3.5 text-white">
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
      <div className="text-[15px] font-black tabular-nums">{value}</div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-white/60">{label}</div>
    </div>
  );
}

function BannerCard({ market, stats, grad }: { market: Market; stats?: MarketStat; grad: string }) {
  const emojiOf = useCategoryEmoji();
  const img = market.image_url?.trim();
  const isUrl = img && /^https?:\/\//i.test(img);
  const pYes = displayPriceYes(market);
  const pct = toPercent(pYes);
  const vol = Number(stats?.volume ?? 0);
  const traders = Number(stats?.trader_count ?? 0);

  return (
    <Link
      href={`/market/${market.id}`}
      className="group relative flex h-44 flex-col overflow-hidden rounded-2xl p-4 ring-1 ring-white/10 transition-transform duration-200 hover:-translate-y-0.5"
      style={{ background: grad }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-white/10" />

      {/* category tag + corner image */}
      <div className="relative mb-2 flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-orange-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
          <Flame size={11} fill="currentColor" /> Trending now
        </span>
        {isUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover shadow-md ring-1 ring-white/25" />
        ) : (
          <span className="shrink-0 text-xl leading-none drop-shadow">{img || emojiOf(market.category)}</span>
        )}
      </div>

      <h3 className="relative line-clamp-2 text-sm font-bold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
        {market.question}
      </h3>

      <div className="relative mt-auto">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-bold text-white">{pct} chance</span>
          <span className="font-medium text-white/65">
            ${formatCompact(vol)} · {traders} traders
          </span>
        </div>
        {/* yes/no probability bar */}
        <div className="flex h-1.5 overflow-hidden rounded-full bg-rose-500/30">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pYes * 100}%` }} />
        </div>
        {/* yes / no prices */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <span className="rounded-lg bg-black/25 py-1 text-center text-[11px] font-bold text-emerald-300 backdrop-blur-sm">
            Yes {toCents(pYes)}
          </span>
          <span className="rounded-lg bg-black/25 py-1 text-center text-[11px] font-bold text-rose-300 backdrop-blur-sm">
            No {toCents(1 - pYes)}
          </span>
        </div>
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
