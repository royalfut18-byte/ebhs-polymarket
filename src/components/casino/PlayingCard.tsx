"use client";

import { motion } from "framer-motion";
import type { Card } from "@/lib/types";
import { isRed, rankLabel, suitLabel } from "@/lib/casino/games";
import clsx from "clsx";

// A single playing card. Pass `card` to show a face, or omit for face-down.
export default function PlayingCard({
  card,
  size = "md",
  faceDown = false,
}: {
  card?: Card;
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
}) {
  const dims = {
    sm: "h-16 w-11 text-base",
    md: "h-24 w-16 text-2xl",
    lg: "h-32 w-24 text-4xl",
  }[size];

  if (faceDown || !card) {
    return (
      <div
        className={clsx(
          dims,
          "flex items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-brand/40 to-accent-violet/40 shadow-card"
        )}
      >
        <div className="h-3/4 w-3/4 rounded-lg border border-white/15 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.08)_0_6px,transparent_6px_12px)]" />
      </div>
    );
  }

  const red = isRed(card.s);
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
      className={clsx(
        dims,
        "relative flex flex-col items-center justify-center rounded-xl border border-black/10 bg-white font-bold shadow-card",
        red ? "text-rose-600" : "text-slate-900"
      )}
    >
      <span className="absolute left-1.5 top-1 text-xs font-bold leading-none">{rankLabel(card.r)}</span>
      <span>{suitLabel(card.s)}</span>
      <span className="absolute bottom-1 right-1.5 rotate-180 text-xs font-bold leading-none">
        {rankLabel(card.r)}
      </span>
    </motion.div>
  );
}
