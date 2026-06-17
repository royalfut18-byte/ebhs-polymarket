"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Info, Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useCategories } from "../useCategories";
import type { Market } from "@/lib/types";

export default function CreateMarketForm() {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const categories = useCategories();

  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  // Prefill the category with the first one once they load.
  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0].name);
  }, [categories, category]);
  const [image, setImage] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [prob, setProb] = useState(50); // starting YES %, 1..99
  const [b, setB] = useState(1000);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Market | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (!question.trim()) {
      setError("Question is required.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("create_market", {
      p_question: question.trim(),
      p_description: description.trim(),
      p_category: category,
      p_image_url: image.trim() || null,
      p_initial_prob: prob / 100,
      p_b: b,
      p_close_at: closeAt ? new Date(closeAt).toISOString() : null,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCreated(data as Market);
    setQuestion("");
    setDescription("");
    setImage("");
    setCloseAt("");
    setProb(50);
    setB(1000);
    queryClient.invalidateQueries({ queryKey: ["markets"] });
    queryClient.invalidateQueries({ queryKey: ["market-stats"] });
  }

  return (
    <form onSubmit={submit} className="card flex max-w-2xl flex-col gap-4 p-5">
      <h2 className="text-lg font-bold">Create a market</h2>

      <Field label="Question">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Will the EBHS basketball team win Friday's game?"
          className="input"
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Add context, resolution criteria, etc."
          className="input resize-y"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category" hint="Pick a preset or type a brand-new category.">
          <input
            list="market-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="input"
          />
          <datalist id="market-categories">
            {categories.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Image URL or emoji (optional)">
          <input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="🏀 or https://…"
            className="input"
          />
        </Field>
      </div>

      <Field label="Close date (optional)">
        <input
          type="datetime-local"
          value={closeAt}
          onChange={(e) => setCloseAt(e.target.value)}
          className="input"
        />
      </Field>

      {/* Initial odds slider */}
      <div className="rounded-xl border border-border bg-bg-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Starting odds</span>
          <span className="text-sm">
            <span className="font-bold text-yes-text">YES {prob}¢</span>
            <span className="mx-2 text-ink-faint">/</span>
            <span className="font-bold text-no-text">NO {100 - prob}¢</span>
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={99}
          value={prob}
          onChange={(e) => setProb(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-1 flex justify-between text-xs text-ink-faint">
          <span>1%</span>
          <span>Starting YES probability: {prob}%</span>
          <span>99%</span>
        </div>
      </div>

      {/* Liquidity */}
      <Field
        label="Liquidity (b)"
        hint="Higher = prices move less per trade. 1000 is a sensible default."
      >
        <input
          type="number"
          min={1}
          step={1}
          value={b}
          onChange={(e) => setB(Math.max(1, Number(e.target.value) || 1))}
          className="input"
        />
      </Field>

      {error && (
        <div className="rounded-xl border border-no/30 bg-no/10 p-3 text-sm text-no-text">
          {error}
        </div>
      )}
      {created && (
        <div className="flex items-center gap-2 rounded-xl border border-yes/30 bg-yes/10 p-3 text-sm text-yes-text">
          <CheckCircle2 size={16} />
          Market created!{" "}
          <Link href={`/market/${created.id}`} className="font-semibold underline">
            View it →
          </Link>
        </div>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary w-fit">
        {loading && <Loader2 size={16} className="animate-spin" />}
        Create market
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
        {label}
        {hint && (
          <span className="group relative inline-flex">
            <Info size={13} className="text-ink-faint" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-52 -translate-x-1/2 rounded-lg border border-border bg-bg-card p-2 text-xs font-normal text-ink-dim group-hover:block">
              {hint}
            </span>
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
