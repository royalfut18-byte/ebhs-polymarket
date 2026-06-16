"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Lightbulb, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase/client";
import { fetchMarketSuggestions } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

export default function SuggestPage() {
  const { user, loading } = useAuth();
  const supabase = getSupabase();
  const queryClient = useQueryClient();

  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = useQuery({
    queryKey: ["my-suggestions", user?.id],
    enabled: !!user,
    queryFn: fetchMarketSuggestions,
  });

  if (loading) return <div className="py-20 text-center text-ink-faint">Loading…</div>;

  if (!user) {
    return (
      <div className="card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 py-14 text-center">
        <Lightbulb size={36} className="text-ink-faint" />
        <h1 className="text-lg font-semibold">Suggest a market</h1>
        <p className="text-sm text-ink-dim">Log in to send the admins your market ideas.</p>
        <Link href="/login" className="btn btn-primary">
          Log in
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (!question.trim()) {
      setError("A question is required.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("market_suggestions").insert({
      user_id: user!.id,
      question: question.trim(),
      description: description.trim(),
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setQuestion("");
    setDescription("");
    queryClient.invalidateQueries({ queryKey: ["my-suggestions", user!.id] });
  }

  const mySuggestions = (mine.data ?? []).filter((s) => s.user_id === user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <Lightbulb size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suggest a market</h1>
          <p className="text-sm text-ink-dim">
            Got a good YES/NO question? Send it to the admins to get it listed.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Question</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will it snow on the last day of school?"
            maxLength={200}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Any extra context or how it should resolve."
            maxLength={1000}
            className="input resize-y"
          />
        </label>

        {error && (
          <div className="rounded-xl border border-no/30 bg-no/10 p-3 text-sm text-no-text">
            {error}
          </div>
        )}
        {done && (
          <div className="flex items-center gap-2 rounded-xl border border-yes/30 bg-yes/10 p-3 text-sm text-yes-text">
            <CheckCircle2 size={16} /> Thanks! Your suggestion was sent to the admins.
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn btn-primary w-fit">
          {submitting && <Loader2 size={16} className="animate-spin" />}
          Submit suggestion
        </button>
      </form>

      {mySuggestions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Your suggestions
          </h2>
          <div className="card divide-y divide-border">
            {mySuggestions.map((s) => (
              <div key={s.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{s.question}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{timeAgo(s.created_at)}</span>
                </div>
                {s.description && (
                  <p className="mt-1 text-sm text-ink-dim">{s.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
