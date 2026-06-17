import type { CasinoGame } from "@/lib/types";

// Shared growth rate for Crash: multiplier(t) = exp(CRASH_K * seconds).
// MUST match the 0.06 constant in supabase/migrations/0009_casino.sql.
export const CRASH_K = 0.06;

export interface GameMeta {
  slug: CasinoGame;
  name: string;
  emoji: string;
  blurb: string;
  /** tailwind from/to colour stops for the card gradient + glow */
  accent: string;
  glow: string;
}

// Order shown on the casino landing page.
export const GAMES: GameMeta[] = [
  { slug: "dice", name: "Dice", emoji: "🎲", blurb: "Roll over or under your number.", accent: "from-emerald-500/20 to-teal-500/5", glow: "rgba(16,185,129,0.5)" },
  { slug: "crash", name: "Crash", emoji: "🚀", blurb: "Cash out before it busts.", accent: "from-rose-500/20 to-orange-500/5", glow: "rgba(244,63,94,0.5)" },
  { slug: "mines", name: "Mines", emoji: "💣", blurb: "Find gems, dodge the bombs.", accent: "from-amber-500/20 to-yellow-500/5", glow: "rgba(245,158,11,0.5)" },
  { slug: "limbo", name: "Limbo", emoji: "📈", blurb: "How high will it go?", accent: "from-violet-500/20 to-fuchsia-500/5", glow: "rgba(168,85,247,0.5)" },
  { slug: "blackjack", name: "Blackjack", emoji: "🃏", blurb: "Beat the dealer to 21.", accent: "from-sky-500/20 to-blue-500/5", glow: "rgba(56,189,248,0.5)" },
  { slug: "roulette", name: "Roulette", emoji: "🎡", blurb: "Spin the wheel, place your chips.", accent: "from-red-500/20 to-rose-500/5", glow: "rgba(239,68,68,0.5)" },
  { slug: "hilo", name: "Hi-Lo", emoji: "🔼", blurb: "Higher or lower than the card?", accent: "from-cyan-500/20 to-sky-500/5", glow: "rgba(34,211,238,0.5)" },
  { slug: "keno", name: "Keno", emoji: "🔢", blurb: "Pick your lucky numbers.", accent: "from-indigo-500/20 to-violet-500/5", glow: "rgba(99,102,241,0.5)" },
  { slug: "baccarat", name: "Baccarat", emoji: "👑", blurb: "Player, banker or tie.", accent: "from-yellow-500/20 to-amber-500/5", glow: "rgba(234,179,8,0.5)" },
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
