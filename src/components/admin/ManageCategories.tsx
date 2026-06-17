"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchCategories } from "@/lib/queries";
import type { Category } from "@/lib/types";

export default function ManageCategories() {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const [newEmoji, setNewEmoji] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["markets"] });
  }

  async function add() {
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);
    const { error } = await supabase.rpc("create_category", {
      p_name: newName.trim(),
      p_emoji: newEmoji.trim(),
    });
    setAdding(false);
    if (error) {
      setError(error.message);
    } else {
      setNewName("");
      setNewEmoji("");
      refresh();
    }
  }

  return (
    <div className="card flex max-w-2xl flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Categories</h2>
        <p className="text-sm text-ink-dim">
          Rename a category, change its emoji, or add new ones. Renaming updates every market in
          that category.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-no/30 bg-no/10 p-3 text-sm text-no-text">
          {error}
        </div>
      )}

      {/* Add new */}
      <div className="flex gap-2">
        <input
          value={newEmoji}
          onChange={(e) => setNewEmoji(e.target.value)}
          placeholder="🎲"
          maxLength={8}
          className="input w-16 shrink-0 text-center text-lg"
          aria-label="New category emoji"
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="New category name"
          maxLength={30}
          className="input"
        />
        <button onClick={add} disabled={adding || !newName.trim()} className="btn btn-primary shrink-0">
          {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-6 text-center text-sm text-ink-faint">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="py-6 text-center text-sm text-ink-dim">No categories yet — add one above.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <CategoryRow key={c.name} category={c} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryRow({ category, onChange }: { category: Category; onChange: () => void }) {
  const supabase = getSupabase();
  const [emoji, setEmoji] = useState(category.emoji);
  const [name, setName] = useState(category.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = name.trim() !== category.name || emoji !== category.emoji;

  async function save() {
    if (!dirty || !name.trim()) return;
    setSaving(true);
    setErr(null);
    setSaved(false);
    const { error } = await supabase.rpc("update_category", {
      p_old_name: category.name,
      p_new_name: name.trim(),
      p_emoji: emoji.trim(),
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onChange();
    }
  }

  async function remove() {
    if (
      !confirm(
        `Delete the "${category.name}" category? Existing markets keep their label, but it won't be a preset anymore.`
      )
    )
      return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("delete_category", { p_name: category.name });
    setBusy(false);
    if (error) setErr(error.message);
    else onChange();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          maxLength={8}
          className="input w-16 shrink-0 text-center text-lg"
          aria-label="Emoji"
        />
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} className="input" />
        <button onClick={save} disabled={saving || !dirty} className="btn btn-ghost shrink-0 px-3">
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <Check size={14} className="text-yes-text" />
          ) : (
            "Save"
          )}
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="btn shrink-0 border border-no/40 bg-no/10 px-2.5 text-no-text hover:bg-no/25"
          aria-label="Delete category"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
      {err && <div className="text-xs text-no-text">{err}</div>}
    </div>
  );
}
