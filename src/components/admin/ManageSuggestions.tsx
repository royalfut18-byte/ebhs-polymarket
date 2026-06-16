"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchMarketSuggestions } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

export default function ManageSuggestions() {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["suggestions"],
    queryFn: fetchMarketSuggestions,
    refetchInterval: 10000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Delete this suggestion?")) return;
    setBusy(id);
    await supabase.from("market_suggestions").delete().eq("id", id);
    setBusy(null);
    queryClient.invalidateQueries({ queryKey: ["suggestions"] });
  }

  if (isLoading) {
    return <div className="card py-10 text-center text-sm text-ink-faint">Loading…</div>;
  }
  if (suggestions.length === 0) {
    return (
      <div className="card py-10 text-center text-sm text-ink-dim">
        No market suggestions yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-dim">
        Ideas submitted by players. Use them in the <span className="font-medium">Create Market</span>{" "}
        tab, then delete once handled.
      </p>
      {suggestions.map((s) => {
        const username = s.profiles?.username;
        return (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">{s.question}</div>
                {s.description && (
                  <p className="mt-1 text-sm text-ink-dim">{s.description}</p>
                )}
                <div className="mt-2 text-xs text-ink-faint">
                  by{" "}
                  {username ? (
                    <Link href={`/u/${username}`} className="text-brand hover:underline">
                      @{username}
                    </Link>
                  ) : (
                    "unknown"
                  )}{" "}
                  · {timeAgo(s.created_at)}
                </div>
              </div>
              <button
                onClick={() => remove(s.id)}
                disabled={busy === s.id}
                className="btn btn-ghost shrink-0 px-2.5 py-1.5 text-xs"
              >
                {busy === s.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
