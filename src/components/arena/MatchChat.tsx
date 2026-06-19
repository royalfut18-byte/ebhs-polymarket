"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { fetchMatchChat } from "@/lib/arena/queries";
import { usePgSubscription } from "@/lib/arena/realtime";
import type { ArenaMatchPlayer } from "@/lib/arena/types";
import clsx from "clsx";

const REACTIONS = ["👍", "😂", "😮", "🔥", "😡", "💀", "🎉", "♟️"];

// Temporary per-match live chat + emoji reactions. Inserts go straight to
// arena_chat (RLS limits it to participants); realtime keeps both sides synced.
export default function MatchChat({
  matchId,
  players,
}: {
  matchId: string;
  players: ArenaMatchPlayer[];
}) {
  const { user } = useAuth();
  const supabase = getSupabase();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: lines = [] } = useQuery({
    queryKey: ["arena-chat", matchId],
    queryFn: () => fetchMatchChat(matchId),
  });

  usePgSubscription(`chat-${matchId}`, "arena_chat", `match_id=eq.${matchId}`, () =>
    qc.invalidateQueries({ queryKey: ["arena-chat", matchId] })
  );

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of players) m.set(p.user_id, p.profiles?.username ?? "player");
    return (id: string) => m.get(id) ?? "player";
  }, [players]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines.length]);

  async function send(kind: "msg" | "reaction", body: string) {
    const b = body.trim().slice(0, 280);
    if (!b || !user) return;
    await supabase.from("arena_chat").insert({ match_id: matchId, user_id: user.id, kind, body: b });
    qc.invalidateQueries({ queryKey: ["arena-chat", matchId] });
  }

  return (
    <div className="card flex h-full max-h-[520px] flex-col p-0">
      <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Match chat</div>

      <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
        {lines.length === 0 && (
          <div className="py-6 text-center text-xs text-ink-faint">Say hi — or trash talk. 👀</div>
        )}
        {lines.map((l) => {
          const mine = l.user_id === user?.id;
          if (l.kind === "reaction") {
            return (
              <div key={l.id} className={clsx("flex items-center gap-1.5", mine && "justify-end")}>
                <span className="text-[10px] text-ink-faint">{nameOf(l.user_id)}</span>
                <span className="text-2xl">{l.body}</span>
              </div>
            );
          }
          return (
            <div key={l.id} className={clsx("flex flex-col", mine && "items-end")}>
              <span className="text-[10px] text-ink-faint">{nameOf(l.user_id)}</span>
              <span
                className={clsx(
                  "max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm",
                  mine ? "bg-brand/20 text-ink" : "bg-bg-soft text-ink"
                )}
              >
                {l.body}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-border px-3 py-2">
        {REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => send("reaction", e)}
            className="rounded-lg px-1.5 py-0.5 text-xl transition-transform hover:scale-125"
          >
            {e}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send("msg", text);
          setText("");
        }}
        className="flex items-center gap-2 border-t border-border p-2.5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          maxLength={280}
          className="input flex-1"
        />
        <button type="submit" disabled={!text.trim()} className="btn btn-primary px-3">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
