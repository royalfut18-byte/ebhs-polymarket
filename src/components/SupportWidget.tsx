"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "@/lib/supabase/client";
import { fetchSupportThread } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import clsx from "clsx";

export default function SupportWidget() {
  const { user, profile } = useAuth();
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["support-thread", user?.id],
    enabled: !!user && open,
    queryFn: () => fetchSupportThread(user!.id),
    refetchInterval: open ? 4000 : false,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, open]);

  // Only normal users get the floating widget (staff use the admin Support panel).
  if (!user || !profile || profile.role !== "user") return null;

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      ticket_user_id: user!.id,
      sender_id: user!.id,
      from_staff: false,
      body: text,
    });
    setSending(false);
    if (!error) {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["support-thread", user!.id] });
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[60vh] max-h-[460px] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-lift">
          <div className="flex items-center justify-between bg-brand-gradient px-4 py-3">
            <div>
              <div className="text-sm font-bold text-white">Support</div>
              <div className="text-xs text-white/80">Message the EBHS admins</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 ? (
              <div className="py-8 text-center text-sm text-ink-faint">
                Send a message — an admin will get back to you here.
              </div>
            ) : (
              messages.map((m) => {
                const mine = !m.from_staff;
                return (
                  <div key={m.id} className={clsx("flex flex-col", mine ? "items-end" : "items-start")}>
                    <div
                      className={clsx(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        mine ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-bg-soft text-ink"
                      )}
                    >
                      {!mine && (
                        <div className="mb-0.5 text-xs font-semibold text-brand-light">Support</div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    </div>
                    <div className="px-1 text-[10px] text-ink-faint">{timeAgo(m.created_at)}</div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex gap-2 border-t border-border p-2.5">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Type a message…"
              maxLength={1000}
              className="input"
            />
            <button onClick={send} disabled={sending || !body.trim()} className="btn btn-primary px-3">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow transition-transform hover:scale-105"
        aria-label="Support chat"
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
