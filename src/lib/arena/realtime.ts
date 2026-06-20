"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { fetchMyChallenges } from "./queries";

// Tracks who is online via a single atomic DB heartbeat: arena_heartbeat()
// stamps the caller's last_seen AND returns everyone seen in the last 30s in one
// round-trip (see migration 0021). Doing it server-side bypasses the RLS read
// and the write/read race that used to leave the lobby showing nobody online.
// Returns the set of online user ids.
const BEAT_MS = 7000;

export function useArenaPresence(): Set<string> {
  const { user } = useAuth();
  const uid = user?.id;
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) return;
    const supabase = getSupabase();
    let active = true;

    const beat = async () => {
      const { data, error } = await supabase.rpc("arena_heartbeat");
      if (error) {
        // Surface this loudly — a silent failure here is exactly what used to
        // make the online list look broken.
        console.error("[arena] heartbeat failed:", error.message);
        return;
      }
      if (active && Array.isArray(data)) setOnline(new Set(data as string[]));
    };

    beat();
    const timer = setInterval(beat, BEAT_MS);
    // Beat again as soon as the tab refocuses so presence recovers instantly.
    const onFocus = () => beat();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [uid]);

  return online;
}

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
