"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "@/lib/queries";
import { DEFAULT_CATEGORIES, categoryEmoji as staticEmoji } from "@/lib/categories";
import type { Category } from "@/lib/types";

/** Live categories from the DB, falling back to the defaults before they load. */
export function useCategories(): Category[] {
  const { data } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 60_000,
  });
  return data && data.length ? data : (DEFAULT_CATEGORIES as Category[]);
}

/** Returns a name -> emoji lookup using live categories (static fallback). */
export function useCategoryEmoji(): (name: string) => string {
  const categories = useCategories();
  const map = new Map(categories.map((c) => [c.name, c.emoji]));
  return (name: string) => map.get(name) ?? staticEmoji(name);
}
