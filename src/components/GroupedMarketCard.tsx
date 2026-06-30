"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, Layers, Users } from "lucide-react";
import type { Market, MarketStat, MarketStatus } from "@/lib/types";
import { displayPriceYes } from "@/lib/lmsr";
import { formatCompact, toPercent } from "@/lib/format";
import { useCategoryEmoji } from "./useCategories";
import StatusBadge from "./StatusBadge";

export default function GroupedMarketCard({
  groupId,
  title,
  category,
  imageUrl,
  status,
  options,
  statsMap,
}: {
  groupId: string;
  title: string;
  category: string;
  imageUrl: string | null;
  status: MarketStatus;
  options: Market[];
  statsMap: Record<string, MarketStat>;
}) {
  const router = useRouter();
  const emojiOf = useCategoryEmoji();

  const sorted = [...options].sort((a, b) => displayPriceYes(b) - displayPriceYes(a));
  const top = sorted.slice(0, 3);
  const more = sorted.length - top.length;

  let volume = 0;
  let traders = 0;
  for (const o of options) {
    const s = statsMap[o.id];
    if (s) {
      volume += Number(s.volume) || 0;
      traders += Number(s.trader_count) || 0;
    }
  }

  const img = imageUrl?.trim();
  const isUrl = img && /^https?:\/\//i.test(img);

  return (
    <motion.div
      onClick={() => router.push(`/group/${groupId}`)}
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="group relative flex h-[232px] cursor-pointer flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#18294a] via-[#112138] to-[#0d1a2c] p-4 shadow-card transition-all duration-300 hover:border-brand/40 hover:shadow-lift"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-brand/25 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative flex items-start gap-3">
        {isUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-border" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] text-2xl ring-1 ring-border">
            {img || emojiOf(category)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink group-hover:text-white">
            {title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/35 bg-brand/12 px-2.5 py-1 text-[11px] font-semibold leading-none text-brand-light">
              <Layers size={11} /> {options.length} options
            </span>
            {status !== "open" && <StatusBadge status={status} />}
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {top.map((o) => {
          const p = displayPriceYes(o);
          return (
            <div key={o.id} className="flex items-center gap-2.5">
              <span className="w-24 shrink-0 truncate text-sm text-ink-dim">{o.option_label}</span>
              <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand to-accent-violet"
                  style={{ width: `${p * 100}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-sm font-bold text-ink">
                {toPercent(p)}
              </span>
            </div>
          );
        })}
        {more > 0 && <div className="text-xs font-medium text-accent-violet">+{more} more</div>}
      </div>

      <div className="relative mt-auto flex items-center gap-2.5 text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <BarChart3 size={13} />
          {`$${formatCompact(volume)} vol`}
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="inline-flex items-center gap-1">
          <Users size={13} />
          {traders} traders
        </span>
      </div>
    </motion.div>
  );
}
