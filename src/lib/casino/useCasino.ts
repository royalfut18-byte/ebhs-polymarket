"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase/client";

// Calls a casino RPC, then refreshes the player's balance + history. Every
// outcome and payout is decided server-side, so the client just relays the
// result. Returns a typed `play` fn plus a `busy` flag for disabling controls.
export function useCasino() {
  const { refreshProfile, user } = useAuth();
  const qc = useQueryClient();
  const supabase = getSupabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const play = useCallback(
    async <T = Record<string, unknown>>(
      fn: string,
      args: Record<string, unknown>
    ): Promise<T> => {
      setError(null);
      setBusy(true);
      try {
        const { data, error: rpcError } = await supabase.rpc(fn, args);
        if (rpcError) throw new Error(rpcError.message);
        // Sync balance + leaderboard + history in the background.
        refreshProfile();
        if (user) qc.invalidateQueries({ queryKey: ["casino-history", user.id] });
        qc.invalidateQueries({ queryKey: ["leaderboard"] });
        return data as T;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [supabase, refreshProfile, qc, user]
  );

  return { play, busy, error, setError };
}
