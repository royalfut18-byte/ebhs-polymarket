// Category pills shown in the nav / home filter. "All" is a filter-only value;
// real markets use one of the concrete categories.
export const CATEGORIES = ["All", "Sports", "School", "Politics", "Memes", "Random"] as const;

// Categories an admin can assign when creating a market (no "All").
export const MARKET_CATEGORIES = CATEGORIES.filter((c) => c !== "All");

export type Category = (typeof CATEGORIES)[number];

// Default categories — seeded into the DB by migration 0004, and used as a
// fallback in the UI before the `categories` table loads (or if it's missing).
export const DEFAULT_CATEGORIES: { name: string; emoji: string; sort_order: number }[] = [
  { name: "Sports", emoji: "🏀", sort_order: 1 },
  { name: "School", emoji: "🎓", sort_order: 2 },
  { name: "Politics", emoji: "🏛️", sort_order: 3 },
  { name: "Memes", emoji: "😹", sort_order: 4 },
  { name: "Random", emoji: "🎲", sort_order: 5 },
];

// A little flair per category, used as a fallback when a market has no image.
export const CATEGORY_EMOJI: Record<string, string> = {
  Sports: "🏀",
  School: "🎓",
  Politics: "🏛️",
  Memes: "😹",
  Random: "🎲",
  All: "✨",
};

export function categoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] ?? "🎲";
}
