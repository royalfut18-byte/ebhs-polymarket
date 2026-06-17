"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, Users } from "lucide-react";
import type { Market, MarketStat } from "@/lib/types";
import { displayPriceYes } from "@/lib/lmsr";
import { formatCompact, toCents, toPercent } from "@/lib/format";
import { useCategoryEmoji } from "./useCategories";
import StatusBadge from "./StatusBadge";
import clsx from "clsx";

function MarketThumb({ market }: { market: Market }) {
  const emojiOf = useCategoryEmoji();
  const img = market.image_url?.trim();
  const isUrl = img && /^https?:\/\//i.test(img);
  if (isUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-border" />;
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] text-2xl ring-1 ring-border">
      {img || emojiOf(market.category)}
    </div>
  );
}

export default function MarketCard({ market, stats }: { market: Market; stats?: MarketStat }) {
  const router = useRouter();
  const pYes = displayPriceYes(market);
  const pNo = 1 - pYes;
  const href = `/market/${market.id}`;
  const tradable = market.status === "open";

  const go = (outcome?: "yes" | "no") => {
    router.push(outcome ? `${href}?o=${outcome}` : href);
  };

  return (
    <motion.div
      onClick={() => go()}
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="group card card-hover relative flex cursor-pointer flex-col gap-3.5 overflow-hidden p-4"
    >
      {/* hover glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-brand/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative flex items-start gap-3">
        <MarketThumb market={market} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink transition-colors group-hover:text-white">
            {market.question}
          </h3>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-faint">
            <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5">{market.category}</span>
            {market.status !== "open" && (
              <StatusBadge status={market.status} resolution={market.resolution} />
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={clsx(
              "text-2xl font-bold leading-none tracking-tight",
              pYes >= 0.5 ? "text-yes-text" : "text-no-text"
            )}
          >
            {toPercent(pYes)}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
            chance
          </div>
        </div>
      </div>

      {/* probability bar */}
      <div className="relative flex h-2 overflow-hidden rounded-full bg-no/25">
        <div
          className="h-full rounded-full bg-gradient-to-r from-yes to-yes-text transition-all duration-500"
          style={{ width: `${pYes * 100}%` }}
        />
      </div>

      {/* buy buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={!tradable}
          onClick={(e) => {
            e.stopPropagation();
            go("yes");
          }}
          className={clsx(
            "btn btn-yes py-2",
            !tradable && "pointer-events-none opacity-50"
          )}
        >
          Yes <span className="opacity-70">{toCents(pYes)}</span>
        </button>
        <button
          disabled={!tradable}
          onClick={(e) => {
            e.stopPropagation();
            go("no");
          }}
          className={clsx("btn btn-no py-2", !tradable && "pointer-events-none opacity-50")}
        >
          No <span className="opacity-70">{toCents(pNo)}</span>
        </button>
      </div>

      {/* footer */}
      <div className="flex items-center gap-4 text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <BarChart3 size={13} />
          {`$${formatCompact(stats?.volume ?? 0)} vol`}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={13} />
          {stats?.trader_count ?? 0} traders
        </span>
      </div>
    </motion.div>
  );
}
