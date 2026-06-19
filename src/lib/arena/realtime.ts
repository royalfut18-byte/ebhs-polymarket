"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

// Tracks who is online via a DB heartbeat (arena_presence table): the client
// upserts its last_seen every 12s and polls every 8s for everyone seen in the
// last 30s. This is reliable regardless of the realtime websocket state (the
// previous Realtime-Presence approach was flaky). Returns online user ids.
const ONLINE_WINDOW_MS = 30000;

export function useArenaPresence(): Set<string> {
  const { user } = useAuth();
  const uid = user?.id;
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) return;
    const supabase = getSupabase();
    let active = true;

    const beat = async () => {
      await supabase.from("arena_presence").upsert({ user_id: uid, last_seen: new Date().toISOString() });
    };
    const refresh = async () => {
      const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
      const { data } = await supabase.from("arena_presence").select("user_id").gt("last_seen", since);
      if (active && data) setOnline(new Set((data as { user_id: string }[]).map((r) => r.user_id)));
    };

    beat();
    refresh();
    const beatTimer = setInterval(beat, 12000);
    const pollTimer = setInterval(refresh, 8000);
    return () => {
      active = false;
      clearInterval(beatTimer);
      clearInterval(pollTimer);
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
