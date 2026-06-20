"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Coins, Loader2, LogOut, Play, RotateCw } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { fetchUnoView } from "@/lib/arena/queries";
import { usePgSubscription } from "@/lib/arena/realtime";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import { FadeIn } from "@/components/motion";
import Avatar from "@/components/Avatar";
import MatchChat from "./MatchChat";
import UnoCard, { UnoCardBack, COLOR_NAME } from "./UnoCard";
import type { ArenaMatchPlayer, UnoCard as Card, UnoColor } from "@/lib/arena/types";
import clsx from "clsx";

const COLOR_SWATCH: Record<Exclude<UnoColor, "w">, string> = {
  r: "#e3342f",
  y: "#f4c20d",
  g: "#2faa4a",
  b: "#3066d6",
};
const IDLE_MS = 45000;

export default function UnoTable({ matchId }: { matchId: string }) {
  const { user, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wildIndex, setWildIndex] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const { data: view, isLoading, isError } = useQuery({
    queryKey: ["uno-view", matchId],
    queryFn: () => fetchUnoView(matchId),
    refetchInterval: 1600, // realtime fallback; moves still sync if a push is missed
  });

  // Every state change touches arena_matches.updated_at, so a single subscription
  // pushes a refresh (clients can't read arena_uno_state directly).
  usePgSubscription(`uno-${matchId}`, "arena_matches", `id=eq.${matchId}`, () =>
    qc.invalidateQueries({ queryKey: ["uno-view", matchId] })
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc(fn, args);
      if (error) throw new Error(error.message);
      refreshProfile();
      qc.invalidateQueries({ queryKey: ["uno-view", matchId] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      qc.invalidateQueries({ queryKey: ["uno-view", matchId] });
    } finally {
      setBusy(false);
    }
  }

  // Players mapped into the shape MatchChat expects.
  const chatPlayers: ArenaMatchPlayer[] = useMemo(
    () =>
      (view?.players ?? []).map((p) => ({
        match_id: matchId,
        user_id: p.user_id,
        seat: p.seat,
        role: null,
        stake: 0,
        outcome: null,
        profiles: { username: p.username },
      })),
    [view?.players, matchId]
  );

  // Celebrate a win once.
  const celebrated = useRef(false);
  useEffect(() => {
    if (view?.status === "finished" && view.winner_id === user?.id && !celebrated.current) {
      celebrated.current = true;
      celebrate(true);
      refreshProfile();
    }
  }, [view?.status, view?.winner_id, user?.id, refreshProfile]);

  if (isLoading) return <div className="py-20 text-center text-ink-faint">Loading table…</div>;
  if (isError || !view)
    return (
      <div className="py-20 text-center text-ink-dim">
        Table not found.{" "}
        <Link href="/arena" className="text-brand-light hover:underline">
          Back to arena
        </Link>
      </div>
    );

  const isHost = view.host_id === user?.id;
  const isMyTurn = view.status === "active" && view.current_user_id === user?.id;
  const pending = view.pending_draw ?? 0;
  const top = view.top ?? null;
  const color = view.color;

  function playable(card: Card): boolean {
    if (!isMyTurn || busy) return false;
    if (pending > 0) {
      if (view!.pending_type === "draw2") return card.v === "draw2";
      if (view!.pending_type === "wild4") return card.v === "wild4";
      return false;
    }
    if (card.v === "wild" || card.v === "wild4") return true;
    if (card.c === color) return true;
    if (top && card.v === top.v) return true;
    return false;
  }

  function playCard(index: number) {
    const card = view!.my_hand[index];
    if (!card || !playable(card)) return;
    if (card.v === "wild" || card.v === "wild4") {
      setWildIndex(index); // ask for a colour first
      return;
    }
    call("uno_play", { p_match: matchId, p_index: index, p_color: null });
  }

  function chooseColor(c: UnoColor) {
    if (wildIndex === null) return;
    const idx = wildIndex;
    setWildIndex(null);
    call("uno_play", { p_match: matchId, p_index: idx, p_color: c });
  }

  const others = (view.players ?? []).filter((p) => p.user_id !== user?.id);
  const idleMs = view.last_action_at ? now - new Date(view.last_action_at).getTime() : 0;
  const canNudge = view.status === "active" && !isMyTurn && idleMs > IDLE_MS;

  // ----- Lobby (waiting room) -------------------------------------------------
  if (view.status === "lobby") {
    const full = (view.players?.length ?? 0) >= (view.max_players ?? 8);
    return (
      <FadeIn className="mx-auto flex max-w-lg flex-col gap-4">
        <TopBar pot={view.pot} />
        <div className="card flex flex-col gap-4 p-6">
          <div>
            <h1 className="text-xl font-black tracking-tight">Uno table</h1>
            <p className="mt-1 text-sm text-ink-dim">
              {formatMoney(view.stake)} each · winner takes the pot. Waiting for the host to start.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {(view.players ?? []).map((p) => (
              <div key={p.user_id} className="flex items-center gap-3 rounded-xl border border-border bg-bg-soft/40 px-3 py-2">
                <Avatar name={p.username} size={32} />
                <span className="flex-1 text-sm font-semibold">
                  @{p.username}
                  {p.user_id === view.host_id && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-brand-light">host</span>}
                </span>
                {p.user_id === user?.id && <span className="text-xs text-ink-faint">you</span>}
              </div>
            ))}
            {Array.from({ length: Math.max(0, (view.max_players ?? 8) - (view.players?.length ?? 0)) }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-ink-faint">
                <div className="h-8 w-8 rounded-full bg-bg-soft" /> Open seat
              </div>
            ))}
          </div>
          {err && <p className="text-sm text-no-text">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => call("uno_leave", { p_match: matchId })} disabled={busy} className="btn btn-ghost flex-1 text-no-text">
              <LogOut size={15} /> {isHost ? "Close table" : "Leave"}
            </button>
            {isHost && (
              <button
                onClick={() => call("uno_start", { p_match: matchId })}
                disabled={busy || (view.players?.length ?? 0) < 2}
                className="btn btn-primary flex-1"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Start game
              </button>
            )}
          </div>
          {isHost && (view.players?.length ?? 0) < 2 && (
            <p className="text-center text-xs text-ink-faint">Need at least 2 players to start.</p>
          )}
          {full && <p className="text-center text-xs text-ink-faint">Table is full.</p>}
        </div>
        <div className="min-h-[300px]">
          <MatchChat matchId={matchId} players={chatPlayers} />
        </div>
      </FadeIn>
    );
  }

  // ----- Active / finished ----------------------------------------------------
  return (
    <FadeIn className="mx-auto flex max-w-5xl flex-col gap-4">
      <TopBar pot={view.pot} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {/* opponents */}
          <div className="flex flex-wrap gap-2">
            {others.map((p) => {
              const turn = view.current_user_id === p.user_id;
              return (
                <div
                  key={p.user_id}
                  className={clsx(
                    "flex items-center gap-2 rounded-xl border px-3 py-2",
                    turn ? "border-brand/50 bg-brand/10" : "border-border bg-bg-soft/40",
                    p.left && "opacity-40"
                  )}
                >
                  <Avatar name={p.username} size={28} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">@{p.username}</div>
                    <div className="flex items-center gap-1 text-[10px] text-ink-faint">
                      {p.left ? "left" : `${p.count ?? 0} cards`}
                      {turn && !p.left && <span className="rounded-full bg-brand/20 px-1.5 font-bold text-brand-light">turn</span>}
                    </div>
                  </div>
                  {!p.left && (
                    <div className="flex -space-x-2.5">
                      {Array.from({ length: Math.min(5, p.count ?? 0) }).map((_, i) => (
                        <UnoCardBack key={i} size={26} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* center: discard + colour + draw */}
          <div className="flex items-center justify-center gap-6 rounded-2xl border border-border bg-bg-soft/30 py-6">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-ink-faint">Pile</span>
              {top ? <UnoCard card={top.v === "wild" || top.v === "wild4" ? { c: color ?? "r", v: top.v } : top} size={84} /> : null}
            </div>
            <div className="flex flex-col items-center gap-2">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-white/30"
                style={{ background: color && color !== "w" ? COLOR_SWATCH[color as Exclude<UnoColor, "w">] : "#444" }}
                title={`Current colour: ${COLOR_NAME[color ?? "r"]}`}
              />
              <span className="text-[10px] uppercase tracking-wide text-ink-faint">{COLOR_NAME[color ?? "r"]}</span>
              {pending > 0 && (
                <span className="rounded-full bg-no/20 px-2 py-0.5 text-[11px] font-bold text-no-text">Stack +{pending}</span>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => call("uno_draw", { p_match: matchId })}
                disabled={!isMyTurn || busy}
                className="flex flex-col items-center gap-1 rounded-xl px-2 py-1 transition-transform enabled:hover:-translate-y-1 disabled:opacity-40"
              >
                <UnoCardBack size={84} />
                <span className="text-[11px] font-semibold text-ink-dim">{pending > 0 ? `Draw ${pending}` : "Draw"}</span>
              </button>
            </div>
          </div>

          {/* turn banner */}
          <div
            className={clsx(
              "rounded-xl border px-4 py-2 text-center text-sm font-semibold",
              isMyTurn ? "border-brand/40 bg-brand/10 text-brand-light" : "border-border bg-bg-soft/40 text-ink-dim"
            )}
          >
            {view.status === "finished"
              ? view.winner_id === user?.id
                ? `You won ${formatMoney(view.pot)}! 🏆`
                : "Game over."
              : isMyTurn
                ? pending > 0
                  ? `Your turn — stack a +${view.pending_type === "wild4" ? 4 : 2} or draw ${pending}.`
                  : "Your turn — play a card or draw."
                : `Waiting for @${others.find((p) => p.user_id === view.current_user_id)?.username ?? "player"}…`}
          </div>

          {canNudge && (
            <button onClick={() => call("uno_force_skip", { p_match: matchId })} disabled={busy} className="btn btn-ghost text-xs">
              <RotateCw size={14} /> Nudge — current player is idle
            </button>
          )}

          {/* my hand */}
          {view.status === "active" && (
            <div className="rounded-2xl border border-border bg-bg-soft/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Your hand</span>
                <button
                  onClick={() => supabase.from("arena_chat").insert({ match_id: matchId, user_id: user!.id, kind: "reaction", body: "🔴 UNO!" })}
                  disabled={(view.my_hand?.length ?? 0) !== 2}
                  className="btn btn-ghost px-2 py-1 text-xs disabled:opacity-40"
                  title="Call it when you're down to one card"
                >
                  Call UNO!
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(view.my_hand ?? []).map((card, i) => (
                  <UnoCard
                    key={i}
                    card={card}
                    size={72}
                    selectable={playable(card)}
                    dimmed={isMyTurn && !playable(card)}
                    onClick={() => playCard(i)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* finished / forfeit controls */}
          {view.status === "finished" || view.status === "void" ? (
            <Link href="/arena" className="btn btn-primary">
              Back to arena
            </Link>
          ) : (
            <button
              onClick={() => {
                if (confirm("Leave this game? You forfeit your stake.")) call("uno_leave", { p_match: matchId });
              }}
              disabled={busy}
              className="btn btn-ghost text-no-text"
            >
              <LogOut size={15} /> Forfeit
            </button>
          )}

          {err && <p className="text-center text-sm text-no-text">{err}</p>}
        </div>

        <div className="min-h-[420px]">
          <MatchChat matchId={matchId} players={chatPlayers} />
        </div>
      </div>

      {/* wild colour picker */}
      {wildIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setWildIndex(null)} />
          <div className="relative w-full max-w-xs rounded-2xl border border-border bg-bg-card p-5 text-center shadow-card">
            <h3 className="text-sm font-bold">Pick a colour</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["r", "y", "g", "b"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => chooseColor(c)}
                  className="flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold text-black ring-2 ring-white/20 transition-transform hover:scale-105"
                  style={{ background: COLOR_SWATCH[c] }}
                >
                  {COLOR_NAME[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </FadeIn>
  );
}

function TopBar({ pot }: { pot: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link href="/arena" className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink">
        <ArrowLeft size={16} /> Arena
      </Link>
      <div className="flex items-center gap-2 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.07] px-3 py-1.5 text-sm">
        <Coins size={15} className="text-yellow-300" />
        <span className="font-semibold tabular-nums">{formatMoney(pot)} pot</span>
      </div>
    </div>
  );
}
