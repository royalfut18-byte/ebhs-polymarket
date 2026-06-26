"use client";

import { useEffect, useSyncExternalStore } from "react";

// A tiny global signal for "a multi-step casino round is currently in progress"
// (blackjack hand, mines/hi-lo round, crash flight). The reflection gate reads
// it and won't lock the player mid-game: while a bet is in play the balance is
// temporarily reduced, which would otherwise look like being broke. The gate
// re-evaluates once the round resolves (win or lose). This is independent of the
// server net-worth calc, so it works even if those migrations aren't applied.
let count = 0;
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

// Call from a game component: registers an in-progress round while `active`.
export function useActiveRound(active: boolean) {
  useEffect(() => {
    if (!active) return;
    count += 1;
    emit();
    return () => {
      count = Math.max(0, count - 1);
      emit();
    };
  }, [active]);
}

export function useAnyRoundActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => count > 0,
    () => false
  );
}
