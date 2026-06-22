"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";

// Site-wide presence. This provider is mounted at the app root, so as long as a
// signed-in user has ANY page open (casino, markets, just browsing) it beats
// their heartbeat — "online" therefore means "using the site", not just "on the
// arena page". arena_heartbeat() (migration 0021) stamps last_seen AND returns
// everyone seen in the last 30s in one atomic round-trip. The returned set is
// shared via context so the arena's online panel reads it without beating again.
//
// Kept deliberately light: a 15s interval (the server's online window is 30s, so
// there's comfortable margin) and we skip beating while the tab is hidden. This
// runs for every signed-in user on every page, so trimming the request volume
// matters — too-frequent polling was contributing to "Failed to fetch" blips.
const BEAT_MS = 15000;

const PresenceContext = createContext<Set<string>>(new Set());

export function useOnlineUsers(): Set<string> {
  return useContext(PresenceContext);
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id;
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) {
      setOnline(new Set());
      return;
    }
    const supabase = getSupabase();
    let active = true;

    const beat = async () => {
      // Don't poll for a backgrounded tab — it just wastes requests.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const { data, error } = await supabase.rpc("arena_heartbeat");
      if (error) {
        console.error("[presence] heartbeat failed:", error.message);
        return;
      }
      if (active && Array.isArray(data)) setOnline(new Set(data as string[]));
    };

    beat();
    const timer = setInterval(beat, BEAT_MS);
    // Beat immediately when the tab becomes visible again so presence recovers fast.
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [uid]);

  return <PresenceContext.Provider value={online}>{children}</PresenceContext.Provider>;
}
