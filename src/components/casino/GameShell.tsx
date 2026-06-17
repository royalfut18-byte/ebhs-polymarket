"use client";

import Link from "next/link";
import { ArrowLeft, Coins } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { formatMoney } from "@/lib/format";
import type { CasinoGame } from "@/lib/types";
import { FadeIn } from "@/components/motion";
import RecentResults from "./RecentResults";

// Shared two-pane layout for every casino game: a controls panel and a game
// canvas, with a header (back link + live balance) and a recent-results strip.
export default function GameShell({
  game,
  title,
  emoji,
  controls,
  children,
}: {
  game: CasinoGame;
  title: string;
  emoji: string;
  controls: React.ReactNode;
  children: React.ReactNode;
}) {
  const { profile } = useAuth();

  return (
    <FadeIn className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/casino"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
        >
          <ArrowLeft size={16} /> Casino
        </Link>
        <div className="flex items-center gap-2 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.07] px-3 py-1.5 text-sm">
          <Coins size={15} className="text-yellow-300" />
          <span className="font-semibold tabular-nums">{formatMoney(profile?.balance ?? 0)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-3xl">{emoji}</span>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="order-2 lg:order-1">
          <div className="card flex flex-col gap-4 p-4">{controls}</div>
        </div>
        <div className="order-1 flex flex-col gap-3 lg:order-2">
          <div className="card relative min-h-[360px] overflow-hidden p-5">{children}</div>
          <RecentResults game={game} />
        </div>
      </div>
    </FadeIn>
  );
}
