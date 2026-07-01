"use client";

import { CATEGORIES } from "@/lib/categories";
import { useCategoryEmoji } from "./useCategories";
import { motion } from "framer-motion";
import clsx from "clsx";

export default function CategoryPills({
  active,
  onChange,
  categories = [...CATEGORIES],
}: {
  active: string;
  onChange: (c: string) => void;
  categories?: string[];
}) {
  const emojiOf = useCategoryEmoji();
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {categories.map((c) => {
        const isActive = active === c;
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={clsx(
              "pill",
              isActive
                ? "text-white"
                : "border border-border bg-white/[0.03] text-ink-dim hover:bg-white/[0.07] hover:text-ink"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="catPill"
                className="absolute inset-0 rounded-full bg-brand-gradient shadow-[0_6px_18px_-6px_rgba(47,128,255,0.7)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1">
              <span>{c === "All" ? "✨" : emojiOf(c)}</span>
              {c}
            </span>
          </button>
        );
      })}
    </div>
  );
}
