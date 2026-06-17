"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchAllProfiles, fetchSupportInbox } from "@/lib/queries";
import { useAuth } from "@/components/AuthProvider";
import { timeAgo } from "@/lib/format";
import Avatar from "@/components/Avatar";
import clsx from "clsx";

export default function AdminSupport() {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: messages = [] } = useQuery({
    queryKey: ["support-inbox"],
    queryFn: fetchSupportInbox,
    refetchInterval: 5000,
  });
  const { data: profiles = [] } = useQuery({ queryKey: ["all-profiles"], queryFn: fetchAllProfiles });

  const [selected, setSelected] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.username]));
    return (id: string) => m.get(id) ?? "user";
  }, [profiles]);

  // Group into tickets (latest message per user). `messages` is newest-first.
  const tickets = useMemo(() => {
    const map = new Map<string, { userId: string; last: string; at: string }>();
    for (const m of messages) {
      if (!map.has(m.ticket_user_id)) {
        map.set(m.ticket_user_id, { userId: m.ticket_user_id, last: m.body, at: m.created_at });
      }
    }
    return Array.from(map.values());
  }, [messages]);

  const thread = useMemo(
    () => messages.filter((m) => m.ticket_user_id === selected).slice().reverse(),
    [messages, selected]
  );

  async function reply() {
    const text = body.trim();
    if (!text || !selected || !user || sending) return;
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      ticket_user_id: selected,
      sender_id: user.id,
      from_staff: true,
      body: text,
    });
    setSending(false);
    if (!error) {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["support-inbox"] });
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Ticket list */}
      <div className="card max-h-[600px] divide-y divide-border overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-faint">No support messages yet.</div>
        ) : (
          tickets.map((t) => (
            <button
              key={t.userId}
              onClick={() => setSelected(t.userId)}
              className={clsx(
                "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-bg-hover",
                selected === t.userId && "bg-brand/10"
              )}
            >
              <Avatar name={nameOf(t.userId)} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">@{nameOf(t.userId)}</div>
                <div className="truncate text-xs text-ink-faint">{t.last}</div>
              </div>
              <div className="shrink-0 text-[10px] text-ink-faint">{timeAgo(t.at)}</div>
            </button>
          ))
        )}
      </div>

      {/* Thread */}
      <div className="card flex h-[600px] flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-faint">
            Select a ticket to reply.
          </div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              @{nameOf(selected)}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {thread.map((m) => {
                const staff = m.from_staff;
                return (
                  <div key={m.id} className={clsx("flex flex-col", staff ? "items-end" : "items-start")}>
                    <div
                      className={clsx(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        staff ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-bg-soft text-ink"
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    </div>
                    <div className="px-1 text-[10px] text-ink-faint">{timeAgo(m.created_at)}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 border-t border-border p-3">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") reply();
                }}
                placeholder="Reply to this user…"
                maxLength={1000}
                className="input"
              />
              <button onClick={reply} disabled={sending || !body.trim()} className="btn btn-primary">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
