"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, Layers, Users } from "lucide-react";
import type { Market, MarketStat, MarketStatus } from "@/lib/types";
import { priceYes } from "@/lib/lmsr";
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

  const sorted = [...options].sort(
    (a, b) => priceYes(b.q_yes, b.q_no, b.b) - priceYes(a.q_yes, a.q_no, a.b)
  );
  const top = sorted.slice(0, 4);
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
      className="group card card-hover relative flex h-full cursor-pointer flex-col gap-3.5 overflow-hidden p-4"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-accent-violet/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

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
          <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1 rounded-md bg-accent-violet/15 px-1.5 py-0.5 font-medium text-accent-violet">
              <Layers size={11} /> {options.length} options
            </span>
            {status !== "open" && <StatusBadge status={status} />}
          </div>
        </div>
      </div>

      <div className="relative flex flex-col gap-2">
        {top.map((o) => {
          const p = priceYes(o.q_yes, o.q_no, o.b);
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

      <div className="relative mt-auto flex items-center gap-4 text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <BarChart3 size={13} />
          {`$${formatCompact(volume)} vol`}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={13} />
          {traders} traders
        </span>
      </div>
    </motion.div>
  );
}
