"use client";

import { CATEGORIES, categoryEmoji } from "@/lib/categories";
import clsx from "clsx";

export default function CategoryPills({
  active,
  onChange,
}: {
  active: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {CATEGORIES.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={clsx(
            "pill",
            active === c
              ? "border-brand bg-brand/15 text-ink"
              : "border-border bg-bg-soft text-ink-dim hover:bg-bg-hover hover:text-ink"
          )}
        >
          <span className="mr-1">{categoryEmoji(c)}</span>
          {c}
        </button>
      ))}
    </div>
  );
}
