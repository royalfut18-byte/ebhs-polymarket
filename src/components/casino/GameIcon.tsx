"use client";

import { Bomb, ChevronsUpDown, CircleDot, Crown, Dice5, Disc3, HelpCircle, Rocket, Spade, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GAME_BY_SLUG } from "@/lib/casino/games";
import type { CasinoGame } from "@/lib/types";

const ICONS: Record<CasinoGame, LucideIcon> = {
  dice: Dice5,
  crash: Rocket,
  mines: Bomb,
  limbo: TrendingUp,
  blackjack: Spade,
  roulette: Disc3,
  hilo: ChevronsUpDown,
  baccarat: Crown,
  plinko: CircleDot,
};

const FALLBACK_ICON = HelpCircle;
const FALLBACK_META = {
  c1: "#475569",
  c2: "#1e293b",
  glow: "rgba(71,85,105,0.45)",
};

// A glossy gradient "medallion" icon for a casino game — replaces flat emoji
// with a consistent, premium icon system (gradient fill, inner gloss, glow).
export default function GameIcon({
  game,
  size = 56,
  className = "",
}: {
  game: string;
  size?: number;
  className?: string;
}) {
  const meta = GAME_BY_SLUG[game as CasinoGame] ?? FALLBACK_META;
  const Icon = ICONS[game as CasinoGame] ?? FALLBACK_ICON;
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/20 ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${meta.c1}, ${meta.c2})`,
        boxShadow: `0 12px 30px -10px ${meta.glow}, inset 0 1px 0 rgba(255,255,255,0.4)`,
      }}
    >
      {/* top gloss */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/30 to-transparent opacity-70" />
      <Icon
        size={Math.round(size * 0.5)}
        strokeWidth={2.2}
        className="relative text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
      />
    </div>
  );
}
