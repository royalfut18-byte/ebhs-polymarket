"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Layers, Users } from "lucide-react";
import { fetchGroupMarkets, fetchMarketStats } from "@/lib/queries";
import { displayPriceYes, isClosedForTrading } from "@/lib/lmsr";
import { formatCompact, toPercent } from "@/lib/format";
import { useCategoryEmoji } from "./useCategories";
import StatusBadge from "./StatusBadge";
import { FadeIn } from "./motion";
import clsx from "clsx";

export default function GroupDetail({ groupId }: { groupId: string }) {
  const emojiOf = useCategoryEmoji();
  const { data: options = [], isLoading, isError } = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => fetchGroupMarkets(groupId),
    refetchInterval: 5000,
  });
  const { data: statsMap = {} } = useQuery({
    queryKey: ["market-stats"],
    queryFn: fetchMarketStats,
  });

  if (isLoading) {
    return <div className="py-20 text-center text-ink-faint">Loading…</div>;
  }
  if (isError || options.length === 0) {
    return (
      <div className="card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <div className="text-lg font-semibold">Market not found</div>
        <Link href="/" className="btn btn-ghost">
          Back to markets
        </Link>
      </div>
    );
  }

  const rep = options[0];
  const title = rep.group_title ?? rep.question;
  const status = options.some((o) => o.status === "open") ? "open" : rep.status;
  const sorted = [...options].sort((a, b) => displayPriceYes(b) - displayPriceYes(a));

  let volume = 0;
  let traders = 0;
  for (const o of options) {
    const s = statsMap[o.id];
    if (s) {
      volume += Number(s.volume) || 0;
      traders += Number(s.trader_count) || 0;
    }
  }

  const img = rep.image_url?.trim();
  const isUrl = img && /^https?:\/\//i.test(img);

  return (
    <FadeIn className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-dim hover:text-ink">
        <ArrowLeft size={16} /> Markets
      </Link>

      <div className="flex items-start gap-4">
        {isUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-16 w-16 rounded-xl object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-bg-card text-4xl">
            {img || emojiOf(rep.category)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
            <span className="rounded-full bg-bg-card px-2.5 py-1">{rep.category}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-violet/15 px-2.5 py-1 font-medium text-accent-violet">
              <Layers size={12} /> {options.length} options
            </span>
            {status !== "open" && <StatusBadge status={status} />}
          </div>
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1">
              <BarChart3 size={13} /> {`$${formatCompact(volume)} volume`}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={13} /> {traders} traders
            </span>
          </div>
        </div>
      </div>

      {rep.description && (
        <div className="card p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">
            {rep.description}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {sorted.map((o) => {
          const pYes = displayPriceYes(o);
          const tradable = !isClosedForTrading(o);
          const resolved = o.status === "resolved";
          const won = resolved && o.resolution === "yes";
          return (
            <div key={o.id} className="card card-hover flex items-center gap-4 p-4">
              <Link href={`/market/${o.id}`} className="min-w-0 flex-1">
                <div className="font-semibold text-ink transition-colors hover:text-brand">
                  {o.option_label}
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-no/25">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand to-accent-violet"
                    style={{ width: `${pYes * 100}%` }}
                  />
                </div>
              </Link>
              <div className="shrink-0 text-right">
                <div
                  className={clsx(
                    "text-2xl font-bold leading-none",
                    pYes >= 0.5 ? "text-yes-text" : "text-no-text"
                  )}
                >
                  {toPercent(pYes)}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-ink-faint">chance</div>
              </div>
              <div className="w-[92px] shrink-0">
                {resolved ? (
                  <span
                    className={clsx(
                      "flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold",
                      won ? "bg-yes/15 text-yes-text" : "bg-no/15 text-no-text"
                    )}
                  >
                    {won ? "WON" : "LOST"}
                  </span>
                ) : (
                  <Link
                    href={`/market/${o.id}?o=yes`}
                    className={clsx(
                      "btn btn-primary w-full py-2 text-sm",
                      !tradable && "pointer-events-none opacity-50"
                    )}
                  >
                    Buy
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </FadeIn>
  );
}
