"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "@/lib/supabase/client";
import { fetchComments } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import Avatar from "./Avatar";

export default function Comments({ marketId }: { marketId: string }) {
  const { user } = useAuth();
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", marketId],
    queryFn: () => fetchComments(marketId),
  });

  async function post() {
    const text = body.trim();
    if (!text || !user) return;
    setPosting(true);
    const { error } = await supabase
      .from("comments")
      .insert({ market_id: marketId, user_id: user.id, body: text });
    setPosting(false);
    if (!error) {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["comments", marketId] });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {user ? (
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") post();
            }}
            placeholder="Add a comment…"
            maxLength={500}
            className="input"
          />
          <button onClick={post} disabled={posting || !body.trim()} className="btn btn-primary">
            {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-bg-soft p-3 text-center text-sm text-ink-dim">
          <Link href="/login" className="text-brand hover:underline">
            Log in
          </Link>{" "}
          to join the conversation.
        </div>
      )}

      {isLoading ? (
        <div className="py-6 text-center text-sm text-ink-faint">Loading comments…</div>
      ) : comments.length === 0 ? (
        <div className="py-6 text-center text-sm text-ink-faint">No comments yet.</div>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => {
            const username = c.profiles?.username || "someone";
            return (
              <li key={c.id} className="flex gap-3">
                <Avatar name={username} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-ink">@{username}</span>
                    <span className="text-xs text-ink-faint">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-ink-dim">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
