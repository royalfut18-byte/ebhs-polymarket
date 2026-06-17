"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchMarkets } from "@/lib/queries";
import { displayPriceYes } from "@/lib/lmsr";
import { toPercent } from "@/lib/format";
import type { Market } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/components/AuthProvider";
import { useCategories } from "@/components/useCategories";
import clsx from "clsx";

export default function ManageMarkets() {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: markets = [], isLoading } = useQuery({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  function invalidate() {
    ["markets", "market-stats", "leaderboard"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] })
    );
  }

  async function run(id: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusyId(id);
    setError(null);
    const { error } = await fn();
    setBusyId(null);
    if (error) setError(error.message);
    else {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["market", id] });
    }
  }

  if (isLoading) {
    return <div className="card py-10 text-center text-sm text-ink-faint">Loading markets…</div>;
  }
  if (markets.length === 0) {
    return <div className="card py-10 text-center text-sm text-ink-dim">No markets yet.</div>;
  }

  const standalone = markets.filter((m) => !m.group_id);
  const groupsMap = new Map<string, Market[]>();
  for (const m of markets) {
    if (m.group_id) {
      const arr = groupsMap.get(m.group_id);
      if (arr) arr.push(m);
      else groupsMap.set(m.group_id, [m]);
    }
  }
  const groups = Array.from(groupsMap.entries());

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-xl border border-no/30 bg-no/10 p-3 text-sm text-no-text">
          {error}
        </div>
      )}

      {groups.map(([gid, opts]) => (
        <GroupAdminCard key={gid} groupId={gid} options={opts} isAdmin={isAdmin} onChange={invalidate} />
      ))}

      {standalone.map((m) => {
        const pYes = displayPriceYes(m);
        const busy = busyId === m.id;
        const settled = m.status === "resolved" || m.status === "cancelled";
        return (
          <div key={m.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <StatusBadge status={m.status} resolution={m.resolution} />
                  <span className="text-xs text-ink-faint">{m.category}</span>
                  <span className="text-xs font-semibold text-yes-text">{toPercent(pYes)} YES</span>
                </div>
                <Link href={`/market/${m.id}`} className="font-semibold hover:text-brand">
                  {m.question}
                </Link>
              </div>
              {busy && <Loader2 size={18} className="animate-spin text-ink-faint" />}
            </div>

            {(!settled || isAdmin) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!settled && (
                  <>
                <button
                  onClick={() => setEditId(editId === m.id ? null : m.id)}
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                >
                  <Pencil size={13} /> Edit
                </button>
                {m.status === "open" ? (
                  <ActionBtn
                    onClick={() =>
                      run(m.id, () => supabase.rpc("set_market_status", { p_market_id: m.id, p_status: "closed" }))
                    }
                    disabled={busy}
                    className="border border-border text-ink hover:bg-bg-hover"
                  >
                    Close
                  </ActionBtn>
                ) : (
                  <ActionBtn
                    onClick={() =>
                      run(m.id, () => supabase.rpc("set_market_status", { p_market_id: m.id, p_status: "open" }))
                    }
                    disabled={busy}
                    className="border border-border text-ink hover:bg-bg-hover"
                  >
                    Reopen
                  </ActionBtn>
                )}
                <ActionBtn
                  onClick={() => {
                    if (confirm("Resolve YES? Winners will be paid 1 credit per YES share.")) {
                      run(m.id, () => supabase.rpc("resolve_market", { p_market_id: m.id, p_resolution: "yes" }));
                    }
                  }}
                  disabled={busy}
                  className="bg-yes/15 text-yes-text hover:bg-yes/25"
                >
                  Resolve YES
                </ActionBtn>
                <ActionBtn
                  onClick={() => {
                    if (confirm("Resolve NO? Winners will be paid 1 credit per NO share.")) {
                      run(m.id, () => supabase.rpc("resolve_market", { p_market_id: m.id, p_resolution: "no" }));
                    }
                  }}
                  disabled={busy}
                  className="bg-no/15 text-no-text hover:bg-no/25"
                >
                  Resolve NO
                </ActionBtn>
                <ActionBtn
                  onClick={() => {
                    if (confirm("Cancel this market? Everyone is refunded what they paid.")) {
                      run(m.id, () => supabase.rpc("cancel_market", { p_market_id: m.id }));
                    }
                  }}
                  disabled={busy}
                  className="border border-border text-ink-dim hover:bg-bg-hover"
                >
                  Cancel
                </ActionBtn>
                  </>
                )}
                {isAdmin && (
                  <ActionBtn
                    onClick={() => {
                      if (
                        confirm(
                          "Permanently DELETE this market? Any holders are refunded their cost basis. This cannot be undone."
                        )
                      ) {
                        run(m.id, () => supabase.rpc("delete_market", { p_market_id: m.id }));
                      }
                    }}
                    disabled={busy}
                    className="border border-no/40 bg-no/10 text-no-text hover:bg-no/25"
                  >
                    <Trash2 size={13} /> Delete
                  </ActionBtn>
                )}
              </div>
            )}

            {editId === m.id && (
              <MarketEditor
                market={m}
                onDone={() => {
                  setEditId(null);
                  invalidate();
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionBtn({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`btn px-3 py-1.5 text-xs ${className ?? ""}`}>
      {children}
    </button>
  );
}

function GroupAdminCard({
  groupId,
  options,
  isAdmin,
  onChange,
}: {
  groupId: string;
  options: Market[];
  isAdmin: boolean;
  onChange: () => void;
}) {
  const supabase = getSupabase();
  const title = options[0]?.group_title ?? "Multi-outcome market";
  const settledAll = options.every((o) => o.status === "resolved" || o.status === "cancelled");
  const sorted = [...options].sort((a, b) => displayPriceYes(b) - displayPriceYes(a));
  const [winner, setWinner] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function resolve() {
    if (!winner) {
      setErr("Pick the winning option first.");
      return;
    }
    const label = options.find((o) => o.id === winner)?.option_label;
    if (!confirm(`Resolve "${title}" → "${label}"? That option pays out at 100¢; all others go to 0.`))
      return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("resolve_group", {
      p_group_id: groupId,
      p_winner_market_id: winner,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else onChange();
  }

  async function loopRpc(name: "cancel_market" | "delete_market", filterOpen: boolean) {
    setBusy(true);
    setErr(null);
    for (const o of options) {
      if (filterOpen && !(o.status === "open" || o.status === "closed")) continue;
      const { error } = await supabase.rpc(name, { p_market_id: o.id });
      if (error) {
        setErr(error.message);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    onChange();
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-violet/15 px-2 py-0.5 text-xs font-medium text-accent-violet">
          Multi · {options.length} options
        </span>
        <span className="text-xs text-ink-faint">{options[0]?.category}</span>
        {settledAll && <span className="text-xs font-semibold text-brand">Settled</span>}
      </div>
      <Link href={`/group/${groupId}`} className="font-semibold hover:text-brand">
        {title}
      </Link>

      <div className="mt-3 flex flex-col gap-1.5">
        {sorted.map((o) => (
          <div key={o.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink-dim">{o.option_label}</span>
            {o.status === "resolved" ? (
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-xs font-semibold",
                  o.resolution === "yes" ? "bg-yes/15 text-yes-text" : "bg-no/15 text-no-text"
                )}
              >
                {o.resolution === "yes" ? "WON" : "LOST"}
              </span>
            ) : (
              <span className="font-semibold text-ink">{toPercent(displayPriceYes(o))}</span>
            )}
          </div>
        ))}
      </div>

      {err && <div className="mt-2 text-xs text-no-text">{err}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!settledAll && (
          <>
            <select
              value={winner}
              onChange={(e) => setWinner(e.target.value)}
              className="input w-auto py-1.5 text-xs"
            >
              <option value="">Resolve to…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.option_label}
                </option>
              ))}
            </select>
            <button
              onClick={resolve}
              disabled={busy || !winner}
              className="btn bg-yes/15 px-3 py-1.5 text-xs text-yes-text hover:bg-yes/25"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : "Resolve"}
            </button>
            <button
              onClick={() => {
                if (confirm("Cancel this whole market? Everyone is refunded what they paid."))
                  loopRpc("cancel_market", true);
              }}
              disabled={busy}
              className="btn btn-ghost px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </>
        )}
        {isAdmin && (
          <button
            onClick={() => {
              if (
                confirm(
                  "Permanently delete this whole multi-outcome market? Holders are refunded their cost basis. This cannot be undone."
                )
              )
                loopRpc("delete_market", false);
            }}
            disabled={busy}
            className="btn border border-no/40 bg-no/10 px-3 py-1.5 text-xs text-no-text hover:bg-no/25"
          >
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

function MarketEditor({ market, onDone }: { market: Market; onDone: () => void }) {
  const supabase = getSupabase();
  const categories = useCategories();
  const [question, setQuestion] = useState(market.question);
  const [description, setDescription] = useState(market.description);
  const [category, setCategory] = useState(market.category);
  const [image, setImage] = useState(market.image_url ?? "");
  const [closeAt, setCloseAt] = useState(
    market.close_at ? new Date(market.close_at).toISOString().slice(0, 16) : ""
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    const { error } = await supabase.rpc("update_market", {
      p_market_id: market.id,
      p_question: question,
      p_description: description,
      p_category: category,
      p_image_url: image.trim() || null,
      p_close_at: closeAt ? new Date(closeAt).toISOString() : null,
    });
    setSaving(false);
    if (error) setErr(error.message);
    else onDone();
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-bg-soft p-3">
      <input value={question} onChange={(e) => setQuestion(e.target.value)} className="input" />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="input resize-y"
        placeholder="Description"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input"
        >
          {category && !categories.some((c) => c.name === category) && (
            <option value={category}>{category}</option>
          )}
          {categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <input
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="Image / emoji"
          className="input"
        />
        <input
          type="datetime-local"
          value={closeAt}
          onChange={(e) => setCloseAt(e.target.value)}
          className="input"
        />
      </div>
      {err && <div className="text-xs text-no-text">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="btn btn-primary px-3 py-1.5 text-xs">
          {saving && <Loader2 size={13} className="animate-spin" />}
          Save
        </button>
        <button onClick={onDone} className="btn btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
