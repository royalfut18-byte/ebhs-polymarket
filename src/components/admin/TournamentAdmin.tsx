"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Plus, RotateCcw, Trash2, Trophy, Wand2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchLeaderboard, fetchPastWinners } from "@/lib/queries";
import type { PastWinnerMonth } from "@/lib/types";

const PLACES = ["1st", "2nd", "3rd", "4th", "5th"];

function thisMonthLabel() {
  return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default function TournamentAdmin() {
  const supabase = getSupabase();
  const qc = useQueryClient();

  // ---- reset all balances ----
  const [pw, setPw] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);

  async function resetTournament() {
    if (!pw) {
      setResetErr("Enter the reset password.");
      return;
    }
    if (!window.confirm("This sets EVERYONE back to $1000 and clears the leaderboard. This cannot be undone. Continue?")) {
      return;
    }
    setResetting(true);
    setResetErr(null);
    setResetMsg(null);
    const { data, error } = await supabase.rpc("admin_reset_tournament", { p_password: pw });
    setResetting(false);
    if (error) {
      setResetErr(error.message);
      return;
    }
    const users = (data as { users?: number })?.users ?? 0;
    setResetMsg(`Done — reset ${users} player${users === 1 ? "" : "s"} to $1000.`);
    setPw("");
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
    qc.invalidateQueries({ queryKey: ["all-profiles"] });
  }

  // ---- past winners ----
  const { data: saved, isFetched } = useQuery({ queryKey: ["past-winners"], queryFn: fetchPastWinners });
  const { data: board = [] } = useQuery({ queryKey: ["leaderboard"], queryFn: fetchLeaderboard });
  const [months, setMonths] = useState<PastWinnerMonth[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isFetched || loaded) return;
    setMonths(saved ?? []);
    setLoaded(true);
  }, [isFetched, saved, loaded]);

  function patchMonth(mi: number, patch: Partial<PastWinnerMonth>) {
    setMonths((ms) => ms.map((m, i) => (i === mi ? { ...m, ...patch } : m)));
  }
  function patchWinner(mi: number, wi: number, patch: Partial<PastWinnerMonth["winners"][number]>) {
    setMonths((ms) =>
      ms.map((m, i) =>
        i === mi ? { ...m, winners: m.winners.map((w, j) => (j === wi ? { ...w, ...patch } : w)) } : m
      )
    );
  }
  function addMonth() {
    setMonths((ms) => [{ month: thisMonthLabel(), winners: [{ place: "1st", username: "", prize: "" }] }, ...ms]);
  }
  function fillFromCurrent(mi: number) {
    const top = board.filter((r) => r.role === "user").slice(0, 3);
    setMonths((ms) =>
      ms.map((m, i) =>
        i === mi
          ? { ...m, winners: top.map((r, k) => ({ place: PLACES[k], username: r.username, prize: m.winners[k]?.prize ?? "" })) }
          : m
      )
    );
  }
  function addWinner(mi: number) {
    setMonths((ms) =>
      ms.map((m, i) =>
        i === mi ? { ...m, winners: [...m.winners, { place: PLACES[m.winners.length] ?? "—", username: "", prize: "" }] } : m
      )
    );
  }
  function removeWinner(mi: number, wi: number) {
    setMonths((ms) => ms.map((m, i) => (i === mi ? { ...m, winners: m.winners.filter((_, j) => j !== wi) } : m)));
  }
  function removeMonth(mi: number) {
    setMonths((ms) => ms.filter((_, i) => i !== mi));
  }

  async function saveWinners() {
    setSaving(true);
    setSaveErr(null);
    setSavedOk(false);
    const clean: PastWinnerMonth[] = months
      .map((m) => ({
        month: m.month.trim(),
        winners: m.winners
          .map((w) => ({ place: w.place.trim(), username: w.username.trim().replace(/^@/, ""), prize: w.prize.trim() }))
          .filter((w) => w.username),
      }))
      .filter((m) => m.month && m.winners.length);
    const { error } = await supabase.rpc("set_setting", { p_key: "past_winners", p_value: clean });
    setSaving(false);
    if (error) {
      setSaveErr(error.message);
      return;
    }
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 1500);
    qc.invalidateQueries({ queryKey: ["past-winners"] });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {/* ---- reset ---- */}
      <div className="card flex flex-col gap-3 border-rose-500/30 p-5">
        <div className="flex items-center gap-2 text-rose-300">
          <AlertTriangle size={18} />
          <h2 className="text-lg font-bold">Reset tournament</h2>
        </div>
        <p className="text-sm text-ink-dim">
          Sets <span className="font-semibold text-ink">every player back to $1000</span>, clears all portfolios and
          wipes the leaderboard for a fresh month. This <span className="font-semibold text-ink">cannot be undone.</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Reset password"
            autoComplete="off"
            className="input w-44"
          />
          <button
            onClick={resetTournament}
            disabled={resetting}
            className="btn py-2.5 font-bold text-white"
            style={{ background: "linear-gradient(90deg,#e11d48,#be123c)" }}
          >
            {resetting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Reset all balances to $1000
          </button>
        </div>
        {resetErr && <p className="text-sm text-no-text">{resetErr}</p>}
        {resetMsg && (
          <p className="inline-flex items-center gap-1.5 text-sm text-yes-text">
            <CheckCircle2 size={15} /> {resetMsg}
          </p>
        )}
      </div>

      {/* ---- past winners ---- */}
      <div className="card flex flex-col gap-4 p-5">
        <div>
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-yellow-300" />
            <h2 className="text-lg font-bold">Past winners</h2>
          </div>
          <p className="text-sm text-ink-dim">
            Pick the champions for each finished month — shown in a Hall of Fame on the leaderboard.
          </p>
        </div>

        <button onClick={addMonth} className="btn btn-primary w-fit px-3 py-1.5 text-sm">
          <Plus size={14} /> Add a month
        </button>

        {months.length === 0 && <p className="text-sm text-ink-faint">No past winners yet.</p>}

        {months.map((m, mi) => (
          <div key={mi} className="flex flex-col gap-2 rounded-xl border border-border bg-bg-soft/40 p-3">
            <div className="flex items-center gap-2">
              <input
                value={m.month}
                onChange={(e) => patchMonth(mi, { month: e.target.value })}
                placeholder="June 2026"
                className="input w-40 font-semibold"
              />
              <button onClick={() => fillFromCurrent(mi)} className="btn btn-ghost px-2.5 py-1.5 text-xs" title="Fill with the current leaderboard's top 3">
                <Wand2 size={13} /> Top 3 now
              </button>
              <button onClick={() => removeMonth(mi)} className="btn btn-ghost ml-auto px-2.5" aria-label="Remove month">
                <Trash2 size={15} />
              </button>
            </div>
            {m.winners.map((w, wi) => (
              <div key={wi} className="flex gap-2">
                <input
                  value={w.place}
                  onChange={(e) => patchWinner(mi, wi, { place: e.target.value })}
                  placeholder="1st"
                  className="input w-16 shrink-0"
                />
                <input
                  value={w.username}
                  onChange={(e) => patchWinner(mi, wi, { username: e.target.value })}
                  placeholder="@username"
                  className="input flex-1"
                />
                <input
                  value={w.prize}
                  onChange={(e) => patchWinner(mi, wi, { prize: e.target.value })}
                  placeholder="prize (optional)"
                  className="input flex-1"
                />
                <button onClick={() => removeWinner(mi, wi)} className="btn btn-ghost shrink-0 px-2.5" aria-label="Remove winner">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button onClick={() => addWinner(mi)} className="btn btn-ghost w-fit px-3 py-1 text-xs">
              <Plus size={13} /> Add place
            </button>
          </div>
        ))}

        {saveErr && <div className="rounded-xl border border-no/30 bg-no/10 p-3 text-sm text-no-text">{saveErr}</div>}
        <div className="flex items-center gap-3">
          <button onClick={saveWinners} disabled={saving} className="btn btn-primary w-fit">
            {saving && <Loader2 size={16} className="animate-spin" />}
            Save past winners
          </button>
          {savedOk && (
            <span className="inline-flex items-center gap-1.5 text-sm text-yes-text">
              <CheckCircle2 size={15} /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
