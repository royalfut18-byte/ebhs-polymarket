"use client";

import Link from "next/link";
import { ArrowLeft, Coins } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { formatMoney } from "@/lib/format";
import type { CasinoGame } from "@/lib/types";
import { GAME_BY_SLUG } from "@/lib/casino/games";
import { FadeIn } from "@/components/motion";
import GameIcon from "./GameIcon";
import RecentResults from "./RecentResults";

// Shared two-pane layout for every casino game: a controls panel and a game
// canvas, with a header (back link + live balance) and a recent-results strip.
export default function GameShell({
  game,
  controls,
  children,
}: {
  game: CasinoGame;
  controls: React.ReactNode;
  children: React.ReactNode;
}) {
  const { profile } = useAuth();
  const meta = GAME_BY_SLUG[game];

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

      <div className="flex items-center gap-3">
        <GameIcon game={game} size={44} />
        <h1 className="text-2xl font-bold tracking-tight">{meta.name}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="order-2 lg:order-1">
          <div className="card flex flex-col gap-4 p-4">{controls}</div>
        </div>
        <div className="order-1 flex flex-col gap-3 lg:order-2">
          <div className="card relative min-h-[360px] overflow-hidden p-5">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background: `radial-gradient(40rem 26rem at 50% -10%, ${meta.c1}1f, transparent 60%)`,
              }}
            />
            <div className="relative flex h-full flex-col">{children}</div>
          </div>
          <RecentResults game={game} />
        </div>
      </div>
    </FadeIn>
  );
}
