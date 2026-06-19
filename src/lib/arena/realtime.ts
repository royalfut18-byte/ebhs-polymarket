"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

// Tracks who is currently online via Supabase Realtime Presence on a shared
// "arena-lobby" channel. Returns the set of online user ids. No DB needed.
export function useArenaPresence(): Set<string> {
  const { user, profile } = useAuth();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabase();
    const channel = supabase.channel("arena-lobby", {
      config: { presence: { key: user.id } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ username: profile?.username ?? "", at: Date.now() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile?.username]);

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
