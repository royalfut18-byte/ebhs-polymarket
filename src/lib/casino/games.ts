import type { CasinoGame } from "@/lib/types";

// Shared growth rate for Crash: multiplier(t) = exp(CRASH_K * seconds).
// MUST match the 0.06 constant in supabase/migrations/0009_casino.sql.
export const CRASH_K = 0.06;

export interface GameMeta {
  slug: CasinoGame;
  name: string;
  blurb: string;
  tag: string;
  /** tailwind from/to colour stops for the card gradient */
  accent: string;
  /** gradient stops (hex) for the icon medallion + glow */
  c1: string;
  c2: string;
  glow: string;
}

// Order shown on the casino landing page.
export const GAMES: GameMeta[] = [
  { slug: "dice", name: "Dice", blurb: "Roll over or under your number.", tag: "1.98× even", accent: "from-emerald-500/20 to-teal-500/5", c1: "#34d399", c2: "#14b8a6", glow: "rgba(16,185,129,0.55)" },
  { slug: "crash", name: "Crash", blurb: "Cash out before it busts.", tag: "Up to ∞×", accent: "from-rose-500/20 to-orange-500/5", c1: "#fb7185", c2: "#f97316", glow: "rgba(244,63,94,0.55)" },
  { slug: "mines", name: "Mines", blurb: "Find gems, dodge the bombs.", tag: "1–24 mines", accent: "from-amber-500/20 to-yellow-500/5", c1: "#f59e0b", c2: "#fbbf24", glow: "rgba(245,158,11,0.55)" },
  { slug: "limbo", name: "Limbo", blurb: "How high will it go?", tag: "Up to 1M×", accent: "from-violet-500/20 to-fuchsia-500/5", c1: "#a855f7", c2: "#d946ef", glow: "rgba(168,85,247,0.55)" },
  { slug: "blackjack", name: "Blackjack", blurb: "Beat the dealer to 21.", tag: "BJ pays 3:2", accent: "from-sky-500/20 to-blue-500/5", c1: "#38bdf8", c2: "#3b82f6", glow: "rgba(56,189,248,0.55)" },
  { slug: "roulette", name: "Roulette", blurb: "Spin the wheel, place your chips.", tag: "35:1 max", accent: "from-red-500/20 to-rose-500/5", c1: "#ef4444", c2: "#f43f5e", glow: "rgba(239,68,68,0.55)" },
  { slug: "hilo", name: "Hi-Lo", blurb: "Higher or lower than the card?", tag: "Stack streaks", accent: "from-cyan-500/20 to-sky-500/5", c1: "#22d3ee", c2: "#38bdf8", glow: "rgba(34,211,238,0.55)" },
  { slug: "keno", name: "Keno", blurb: "Pick your lucky numbers.", tag: "Up to 1000×", accent: "from-indigo-500/20 to-violet-500/5", c1: "#6366f1", c2: "#a855f7", glow: "rgba(99,102,241,0.55)" },
  { slug: "baccarat", name: "Baccarat", blurb: "Player, banker or tie.", tag: "Tie pays 8:1", accent: "from-yellow-500/20 to-amber-500/5", c1: "#fde047", c2: "#f59e0b", glow: "rgba(234,179,8,0.55)" },
];

export const GAME_BY_SLUG: Record<CasinoGame, GameMeta> = GAMES.reduce(
  (acc, g) => ({ ...acc, [g.slug]: g }),
  {} as Record<CasinoGame, GameMeta>
);

// Card display helpers --------------------------------------------------------
export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function rankLabel(r: number): string {
  return RANKS[r] ?? String(r);
}
export function suitLabel(s: number): string {
  return SUITS[s] ?? "♠";
}
export function isRed(s: number): boolean {
  return s === 1 || s === 2; // hearts / diamonds
}
