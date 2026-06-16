"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchAdminMessages } from "@/lib/queries";
import { useAuth } from "@/components/AuthProvider";
import { timeAgo } from "@/lib/format";
import clsx from "clsx";

export default function AdminChat() {
  const { user } = useAuth();
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["admin-messages"],
    queryFn: fetchAdminMessages,
    refetchInterval: 3000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text || !user || sending) return;
    setSending(true);
    const { error } = await supabase
      .from("admin_messages")
      .insert({ user_id: user.id, body: text });
    setSending(false);
    if (!error) {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["admin-messages"] });
    }
  }

  return (
    <div className="card mx-auto flex h-[70vh] max-h-[620px] w-full max-w-2xl flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-semibold">Staff chat</div>
        <div className="text-xs text-ink-faint">Visible to admins and sub-admins only.</div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-faint">No messages yet. Say hi 👋</div>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === user?.id;
            const username = m.profiles?.username || "staff";
            return (
              <div key={m.id} className={clsx("flex flex-col", mine ? "items-end" : "items-start")}>
                <div
                  className={clsx(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    mine ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-bg-soft text-ink"
                  )}
                >
                  {!mine && (
                    <div className="mb-0.5 text-xs font-semibold text-brand">@{username}</div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
                <div className="mt-0.5 px-1 text-[10px] text-ink-faint">{timeAgo(m.created_at)}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Message the team…"
          maxLength={1000}
          className="input"
        />
        <button onClick={send} disabled={sending || !body.trim()} className="btn btn-primary">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
