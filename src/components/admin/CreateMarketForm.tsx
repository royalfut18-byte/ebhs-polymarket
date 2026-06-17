"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Info, Loader2, Plus, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useCategories } from "../useCategories";
import type { Market } from "@/lib/types";
import clsx from "clsx";

interface Option {
  label: string;
  prob: number; // starting YES %, 1..99
}

const clampProb = (n: number) => Math.min(99, Math.max(1, Math.round(n) || 1));

export default function CreateMarketForm() {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const categories = useCategories();

  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [image, setImage] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [prob, setProb] = useState(50); // starting YES %, single market
  const [b, setB] = useState(1000);

  const [isMulti, setIsMulti] = useState(false);
  const [options, setOptions] = useState<Option[]>([
    { label: "", prob: 50 },
    { label: "", prob: 50 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Market | null>(null);
  const [createdGroup, setCreatedGroup] = useState<string | null>(null);

  // Prefill the category with the first one once they load.
  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0].name);
  }, [categories, category]);

  function updateOption(i: number, patch: Partial<Option>) {
    setOptions((os) => os.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function addOption() {
    setOptions((os) => [...os, { label: "", prob: 50 }]);
  }
  function removeOption(i: number) {
    setOptions((os) => (os.length <= 2 ? os : os.filter((_, idx) => idx !== i)));
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["markets"] });
    queryClient.invalidateQueries({ queryKey: ["market-stats"] });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setCreatedGroup(null);
    if (!question.trim()) {
      setError("Question is required.");
      return;
    }
    setLoading(true);

    if (isMulti) {
      const opts = options
        .map((o) => ({ label: o.label.trim(), prob: clampProb(o.prob) / 100 }))
        .filter((o) => o.label);
      if (opts.length < 2) {
        setLoading(false);
        setError("Add at least 2 options with names.");
        return;
      }
      const { data, error } = await supabase.rpc("create_grouped_market", {
        p_title: question.trim(),
        p_description: description.trim(),
        p_category: category,
        p_image_url: image.trim() || null,
        p_b: b,
        p_close_at: closeAt ? new Date(closeAt).toISOString() : null,
        p_options: opts,
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setCreatedGroup(data as string);
      setQuestion("");
      setDescription("");
      setImage("");
      setCloseAt("");
      setOptions([
        { label: "", prob: 50 },
        { label: "", prob: 50 },
      ]);
      invalidate();
      return;
    }

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
    invalidate();
  }

  return (
    <form onSubmit={submit} className="card flex max-w-2xl flex-col gap-4 p-5">
      <h2 className="text-lg font-bold">Create a market</h2>

      {/* Multi-outcome toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-bg-soft p-3.5">
        <div>
          <div className="text-sm font-medium text-ink">Multiple outcomes</div>
          <div className="text-xs text-ink-dim">
            e.g. “Who will win?” with several options, each priced separately.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isMulti}
          onClick={() => setIsMulti((v) => !v)}
          className={clsx(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            isMulti ? "bg-brand" : "bg-bg-hover"
          )}
        >
          <span
            className={clsx(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
              isMulti ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      <Field label="Question">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            isMulti
              ? "Who will win the spirit week competition?"
              : "Will the EBHS basketball team win Friday's game?"
          }
          className="input"
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Add context, resolution criteria, etc."
          className="input resize-y"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category" hint="Add or rename categories in the Categories tab.">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
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

      {isMulti ? (
        /* Options editor */
        <div className="rounded-xl border border-border bg-bg-soft p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Options</span>
            <span className="text-xs text-ink-faint">Each becomes its own Yes/No market.</span>
          </div>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-ink-faint">
                  {i + 1}
                </span>
                <input
                  value={o.label}
                  onChange={(e) => updateOption(i, { label: e.target.value })}
                  placeholder={`Option ${i + 1}`}
                  className="input"
                />
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={o.prob}
                    onChange={(e) => updateOption(i, { prob: clampProb(Number(e.target.value)) })}
                    className="input w-16 text-center"
                    aria-label="Starting YES %"
                  />
                  <span className="text-sm text-ink-faint">¢</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  disabled={options.length <= 2}
                  className="btn btn-ghost shrink-0 px-2.5 disabled:opacity-30"
                  aria-label="Remove option"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="btn btn-ghost mt-3 w-fit px-3 py-1.5 text-xs"
          >
            <Plus size={14} /> Add option
          </button>
        </div>
      ) : (
        /* Single market: initial odds slider */
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
      )}

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
      {createdGroup && (
        <div className="flex items-center gap-2 rounded-xl border border-yes/30 bg-yes/10 p-3 text-sm text-yes-text">
          <CheckCircle2 size={16} />
          Multi-outcome market created!{" "}
          <Link href={`/group/${createdGroup}`} className="font-semibold underline">
            View it →
          </Link>
        </div>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary w-fit">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {isMulti ? "Create multi-outcome market" : "Create market"}
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
