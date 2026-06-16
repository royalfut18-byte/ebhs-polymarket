"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchPrizes } from "@/lib/queries";
import type { PrizeEntry } from "@/lib/types";

export default function PrizesEditor() {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const { data: prizes, isFetched } = useQuery({ queryKey: ["prizes"], queryFn: fetchPrizes });

  const [title, setTitle] = useState("");
  const [entries, setEntries] = useState<PrizeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isFetched || loaded) return;
    const month = new Date().toLocaleString("en-US", { month: "long" });
    setTitle(prizes?.title || `Prizes for ${month}`);
    setEntries(
      prizes?.entries?.length
        ? prizes.entries
        : [
            { place: "1st place", reward: "" },
            { place: "2nd place", reward: "" },
            { place: "3rd place", reward: "" },
          ]
    );
    setLoaded(true);
  }, [isFetched, prizes, loaded]);

  function updateEntry(i: number, patch: Partial<PrizeEntry>) {
    setEntries((es) => es.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function addEntry() {
    setEntries((es) => [...es, { place: `${es.length + 1}th place`, reward: "" }]);
  }
  function removeEntry(i: number) {
    setEntries((es) => es.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    const clean = entries.filter((e) => e.place.trim() || e.reward.trim());
    const { error } = await supabase.rpc("set_setting", {
      p_key: "leaderboard_prizes",
      p_value: { title: title.trim(), entries: clean },
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      queryClient.invalidateQueries({ queryKey: ["prizes"] });
    }
  }

  return (
    <div className="card flex max-w-2xl flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Leaderboard prizes</h2>
        <p className="text-sm text-ink-dim">
          Shown in a banner at the top of the leaderboard. Leave it empty to hide the banner.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Prizes for June"
          className="input"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">Prizes</span>
        {entries.map((e, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={e.place}
              onChange={(ev) => updateEntry(i, { place: ev.target.value })}
              placeholder="1st place"
              className="input w-36 shrink-0"
            />
            <input
              value={e.reward}
              onChange={(ev) => updateEntry(i, { reward: ev.target.value })}
              placeholder="e.g. $20 gift card 🎁"
              className="input"
            />
            <button
              onClick={() => removeEntry(i)}
              className="btn btn-ghost shrink-0 px-2.5"
              aria-label="Remove prize"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button onClick={addEntry} className="btn btn-ghost w-fit px-3 py-1.5 text-xs">
          <Plus size={14} /> Add prize
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-no/30 bg-no/10 p-3 text-sm text-no-text">{err}</div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn btn-primary w-fit">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Save prizes
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-yes-text">
            <CheckCircle2 size={15} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
