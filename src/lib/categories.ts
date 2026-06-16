// Category pills shown in the nav / home filter. "All" is a filter-only value;
// real markets use one of the concrete categories.
export const CATEGORIES = ["All", "Sports", "School", "Politics", "Memes", "Random"] as const;

// Categories an admin can assign when creating a market (no "All").
export const MARKET_CATEGORIES = CATEGORIES.filter((c) => c !== "All");

export type Category = (typeof CATEGORIES)[number];

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
