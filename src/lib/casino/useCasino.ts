"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase/client";

// Turn raw Supabase/PostgREST errors into something a player can act on.
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "Something went wrong.");
  const m = msg.toLowerCase();
  if (
    m.includes("schema cache") ||
    m.includes("could not find the function") ||
    (m.includes("function") && m.includes("does not exist")) ||
    m.includes("pgrst202")
  ) {
    return "Casino isn't installed on the server yet. An admin needs to run the 0009_casino.sql migration in Supabase (then reload the API schema).";
  }
  if (m.includes("logged in") || m.includes("jwt") || m.includes("not authenticated")) {
    return "Please log in to play.";
  }
  if (m.includes("insufficient")) return "Not enough balance for that bet.";
  return msg;
}

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
        setError(friendlyError(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [supabase, refreshProfile, qc, user]
  );

  return { play, busy, error, setError };
}
