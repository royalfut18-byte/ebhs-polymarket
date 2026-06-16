"use client";

import { useRouter } from "next/navigation";
import { BarChart3, Users } from "lucide-react";
import type { Market, MarketStat } from "@/lib/types";
import { priceYes } from "@/lib/lmsr";
import { formatCompact, toCents, toPercent } from "@/lib/format";
import { categoryEmoji } from "@/lib/categories";
import StatusBadge from "./StatusBadge";
import clsx from "clsx";

function MarketThumb({ market }: { market: Market }) {
  const img = market.image_url?.trim();
  const isUrl = img && /^https?:\/\//i.test(img);
  if (isUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt="" className="h-11 w-11 rounded-lg object-cover" />;
  }
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-bg-hover text-2xl">
      {img || categoryEmoji(market.category)}
    </div>
  );
}

export default function MarketCard({ market, stats }: { market: Market; stats?: MarketStat }) {
  const router = useRouter();
  const pYes = priceYes(market.q_yes, market.q_no, market.b);
  const pNo = 1 - pYes;
  const href = `/market/${market.id}`;
  const tradable = market.status === "open";

  const go = (outcome?: "yes" | "no") => {
    router.push(outcome ? `${href}?o=${outcome}` : href);
  };

  return (
    <div
      onClick={() => go()}
      className="card group flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-bg-hover"
    >
      <div className="flex items-start gap-3">
        <MarketThumb market={market} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink group-hover:text-white">
            {market.question}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-faint">
            <span>{market.category}</span>
            {market.status !== "open" && (
              <StatusBadge status={market.status} resolution={market.resolution} />
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold leading-none text-ink">{toPercent(pYes)}</div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            chance
          </div>
        </div>
      </div>

      {/* YES/NO probability bar */}
      <div className="flex h-1.5 overflow-hidden rounded-full bg-no/30">
        <div className="h-full rounded-full bg-yes" style={{ width: `${pYes * 100}%` }} />
      </div>

      {/* Buy buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={!tradable}
          onClick={(e) => {
            e.stopPropagation();
            go("yes");
          }}
          className={clsx("btn btn-yes", !tradable && "pointer-events-none opacity-50")}
        >
          Yes {toCents(pYes)}
        </button>
        <button
          disabled={!tradable}
          onClick={(e) => {
            e.stopPropagation();
            go("no");
          }}
          className={clsx("btn btn-no", !tradable && "pointer-events-none opacity-50")}
        >
          No {toCents(pNo)}
        </button>
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-4 text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <BarChart3 size={13} />
          {formatCompact(stats?.volume ?? 0)} vol
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={13} />
          {stats?.trader_count ?? 0} traders
        </span>
      </div>
    </div>
  );
}
