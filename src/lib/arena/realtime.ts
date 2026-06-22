"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { fetchMyChallenges } from "./queries";

// NOTE: presence ("who's online") now lives in the app-wide PresenceProvider
// (src/components/PresenceProvider.tsx) so a user counts as online while on ANY
// page, not just the arena. Read it with useOnlineUsers() from there.

// Subscribes to postgres changes on a table (optionally filtered) and runs a
// callback on every change. Used to keep arena queries live.
export function usePgSubscription(
  channelName: string,
  table: string,
  filter: string | undefined,
  onChange: () => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabase();
    const channel = supabase.channel(channelName);
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => onChange()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, filter, enabled]);
}

// Number of pending challenges where the current user is the opponent (i.e.
// someone is waiting on YOU to accept/decline). Kept live across the whole app
// via a realtime subscription plus a polling fallback, so the navbar badge
// lights up wherever you are. Returns 0 when signed out.
export function useIncomingChallengeCount(): number {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["arena-incoming-challenges", uid],
    queryFn: fetchMyChallenges,
    enabled: !!uid,
    refetchInterval: 6000,
  });

  useEffect(() => {
    if (!uid) return;
    const supabase = getSupabase();
    const ch = supabase
      .channel("nav-arena-challenges")
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_challenges" }, () =>
        qc.invalidateQueries({ queryKey: ["arena-incoming-challenges", uid] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, qc]);

  return data.filter((c) => c.opponent_id === uid && c.status === "pending").length;
}
