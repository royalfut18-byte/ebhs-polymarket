"use client";

import { RotateCcw } from "lucide-react";

// Temporary season-changeover notice. Remove this once the reset has happened.
export default function SeasonResetBanner() {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/[0.14] via-amber-400/[0.06] to-transparent p-4">
      <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-amber-400/15 blur-3xl" />
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
        <RotateCcw size={18} />
      </span>
      <div className="relative min-w-0">
        <div className="font-bold text-ink">New season incoming</div>
        <div className="text-sm text-ink-dim">
          All balances will be reset once all markets have been resolved on{" "}
          <span className="font-semibold text-amber-200">3/07/26</span>. No new markets will be created until then.
        </div>
      </div>
    </div>
  );
}
