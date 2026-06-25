"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
import type { ArenaMatchPlayer, UnoCard as Card, UnoColor, UnoPlayer } from "@/lib/arena/types";
import clsx from "clsx";

const COLOR_SWATCH: Record<Exclude<UnoColor, "w">, string> = {
  r: "#e3342f",
  y: "#f4c20d",
  g: "#2faa4a",
  b: "#3066d6",
};
const IDLE_MS = 45000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Opponent screen position on an ellipse around the table (me at the bottom).
// Spread across the top ~200° arc, left → over the top → right.
function anchorPct(i: number, k: number) {
  if (k <= 0) return { x: 50, y: 16 };
  const a = ((170 + ((i + 1) / (k + 1)) * 200) * Math.PI) / 180;
  return { x: 50 + 41 * Math.cos(a), y: 47 + 31 * Math.sin(a) };
}

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
    refetchInterval: 1600,
  });

  usePgSubscription(`uno-${matchId}`, "arena_matches", `id=eq.${matchId}`, () =>
    qc.invalidateQueries({ queryKey: ["uno-view", matchId] })
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Arena box size (for laying out seats + the play animation in pixels).
  const arenaRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view?.status]);

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

  const others: UnoPlayer[] = useMemo(
    () =>
      (view?.players ?? [])
        .filter((p) => p.user_id !== user?.id)
        .sort((a, b) => a.seat - b.seat),
    [view?.players, user?.id]
  );

  // Put-down animation: when a new "played" entry appears, fly the played card
  // from the actor's seat to the centre pile.
  const [fly, setFly] = useState<{ card: Card; fromX: number; fromY: number; key: string } | null>(null);
  const flyKey = useRef<string | null>(null);
  useEffect(() => {
    if (!view || !box.w) return;
    const log = view.log ?? [];
    let lastPlay: { u: string | null; at: string } | null = null;
    for (let i = log.length - 1; i >= 0; i--) {
      if (typeof log[i].t === "string" && log[i].t.startsWith("played")) {
        lastPlay = { u: log[i].u, at: log[i].at };
        break;
      }
    }
    if (!lastPlay) return;
    if (flyKey.current === null) {
      flyKey.current = lastPlay.at; // skip the card already on the pile at mount
      return;
    }
    if (lastPlay.at === flyKey.current || !view.top) return;
    flyKey.current = lastPlay.at;
    const top = view.top;
    const card: Card = top.v === "wild" || top.v === "wild4" ? { c: (view.color ?? "r") as UnoColor, v: top.v } : top;
    let fromX: number;
    let fromY: number;
    if (lastPlay.u === user?.id) {
      fromX = box.w * 0.5;
      fromY = box.h * 0.95;
    } else {
      const idx = others.findIndex((p) => p.user_id === lastPlay!.u);
      const pct = anchorPct(idx < 0 ? 0 : idx, others.length);
      fromX = (box.w * pct.x) / 100;
      fromY = (box.h * pct.y) / 100;
    }
    setFly({ card, fromX, fromY, key: lastPlay.at });
    const id = window.setTimeout(() => setFly(null), 650);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.log, box.w, box.h]);

  // Flash when the direction reverses.
  const [reversed, setReversed] = useState(false);
  const dirRef = useRef<number | null>(null);
  useEffect(() => {
    const d = view?.direction;
    if (d == null) return;
    if (dirRef.current === null) {
      dirRef.current = d;
      return;
    }
    if (d !== dirRef.current) {
      dirRef.current = d;
      setReversed(true);
      const id = window.setTimeout(() => setReversed(false), 1300);
      return () => window.clearTimeout(id);
    }
  }, [view?.direction]);

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
  const dir = view.direction ?? 1;
  const colorHex = color && color !== "w" ? COLOR_SWATCH[color as Exclude<UnoColor, "w">] : "#888";

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
      setWildIndex(index);
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

  const idleMs = view.last_action_at ? now - new Date(view.last_action_at).getTime() : 0;
  const canNudge = view.status === "active" && !isMyTurn && idleMs > IDLE_MS;

  // ---------------- Lobby ----------------
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
              <button onClick={() => call("uno_start", { p_match: matchId })} disabled={busy || (view.players?.length ?? 0) < 2} className="btn btn-primary flex-1">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Start game
              </button>
            )}
          </div>
          {isHost && (view.players?.length ?? 0) < 2 && <p className="text-center text-xs text-ink-faint">Need at least 2 players to start.</p>}
          {full && <p className="text-center text-xs text-ink-faint">Table is full.</p>}
        </div>
        <div className="min-h-[300px]">
          <MatchChat matchId={matchId} players={chatPlayers} />
        </div>
      </FadeIn>
    );
  }

  // ---------------- Active / finished ----------------
  const centerCard = clamp(box.w * 0.1, 54, 92);
  const centerCardW = centerCard * 0.68;
  const centerGap = Math.round(centerCard * 0.4);
  const handCard = clamp(box.w * 0.105, 52, 90);
  const backSize = clamp(box.w * 0.05, 26, 40);
  const hand = view.my_hand ?? [];
  const finished = view.status === "finished" || view.status === "void";
  // The discard is the RIGHT card of the centred [draw | discard] group, so its
  // centre is offset right of box-centre — the play animation lands exactly here.
  const flyTargetX = box.w * 0.5 + centerGap / 2 + centerCardW / 2;
  const flyTargetY = box.h * 0.44;

  return (
    <FadeIn className="mx-auto flex max-w-5xl flex-col gap-4">
      <TopBar pot={view.pot} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-3">
          {/* ===== The table ===== */}
          <div
            ref={arenaRef}
            className="relative w-full overflow-hidden rounded-[28px] border-[6px] border-[#3a1410] shadow-[0_18px_60px_-18px_rgba(0,0,0,0.8)]"
            style={{ aspectRatio: "16 / 11", background: "radial-gradient(circle at 50% 44%, #5a1410 0%, #3a0d0c 55%, #220707 100%)" }}
          >
            {/* glowing centre burst */}
            <div
              className="pointer-events-none absolute left-1/2 top-[44%] h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
              style={{ background: `radial-gradient(circle, ${colorHex}55, transparent 70%)` }}
            />
            <motion.div
              className="pointer-events-none absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 select-none text-[18vw] font-black italic tracking-tighter text-white/5 sm:text-[120px]"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              UNO
            </motion.div>

            {/* opponents */}
            {others.map((p, i) => {
              const pct = anchorPct(i, others.length);
              const turn = view.current_user_id === p.user_id && !finished;
              return (
                <div
                  key={p.user_id}
                  className={clsx("absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1", p.left && "opacity-40 grayscale")}
                  style={{ left: `${pct.x}%`, top: `${pct.y}%` }}
                >
                  {/* fanned backs */}
                  {!p.left && (
                    <div className="flex h-[1.6em] items-end" style={{ fontSize: backSize }}>
                      {Array.from({ length: clamp(p.count ?? 0, 0, 7) }).map((_, j, arr) => {
                        const t = arr.length > 1 ? j / (arr.length - 1) - 0.5 : 0;
                        return (
                          <div key={j} style={{ transform: `rotate(${t * 18}deg) translateY(${Math.abs(t) * 6}px)`, marginLeft: j === 0 ? 0 : -backSize * 0.45, transformOrigin: "bottom center" }}>
                            <UnoCardBack size={backSize} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div
                    className={clsx(
                      "relative rounded-full ring-2 transition-shadow",
                      turn ? "ring-amber-300" : "ring-white/15"
                    )}
                    style={turn ? { boxShadow: "0 0 0 3px rgba(251,191,36,0.35), 0 0 26px rgba(251,191,36,0.6)" } : undefined}
                  >
                    <Avatar name={p.username} size={clamp(box.w * 0.052, 30, 44)} />
                    <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-white ring-2 ring-bg-card">
                      {p.left ? "✕" : p.count ?? 0}
                    </span>
                  </div>
                  <div className="max-w-[88px] truncate rounded-full bg-black/40 px-2 py-0.5 text-center text-[11px] font-semibold text-white">
                    @{p.username}
                  </div>
                </div>
              );
            })}

            {/* centre: the draw pile + discard sit side-by-side as ONE centred
                group; the direction ring encircles both and its arrows point the
                way play is going. */}
            <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2">
              {/* direction ring, centred on the group */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <DirectionRing dir={dir} color={colorHex} size={centerCard * 2.9} />
              </div>

              <div className="relative flex items-center" style={{ gap: centerGap }}>
                {/* draw pile */}
                <button
                  onClick={() => call("uno_draw", { p_match: matchId })}
                  disabled={!isMyTurn || busy}
                  className="group relative transition-transform enabled:hover:-translate-y-1 disabled:cursor-default"
                  style={{ width: centerCardW, height: centerCard }}
                  title={pending > 0 ? `Draw ${pending}` : "Draw a card"}
                >
                  {[0, 1, 2].map((s) => (
                    <div key={s} className="absolute left-0 top-0" style={{ transform: `translate(${s * 2}px, ${-s * 2}px)` }}>
                      <UnoCardBack size={centerCard} />
                    </div>
                  ))}
                  {isMyTurn && (
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-black">
                      {pending > 0 ? `Draw ${pending}` : "Draw"}
                    </span>
                  )}
                </button>

                {/* discard pile */}
                <div className="relative" style={{ width: centerCardW, height: centerCard }}>
                  <div className="pointer-events-none absolute -inset-2 rounded-full opacity-70 blur-xl" style={{ background: colorHex }} />
                  <div className="absolute left-0 top-0 opacity-50" style={{ transform: "rotate(-10deg)" }}>
                    <UnoCardBack size={centerCard} />
                  </div>
                  {top && (
                    <div className="absolute left-0 top-0" style={{ transform: "rotate(4deg)" }}>
                      <UnoCard card={top.v === "wild" || top.v === "wild4" ? { c: (color ?? "r") as UnoColor, v: top.v } : top} size={centerCard} />
                    </div>
                  )}
                </div>
              </div>

              {/* current colour + stack */}
              <div className="absolute -bottom-9 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap">
                <span className="h-3.5 w-3.5 rounded-full ring-2 ring-white/40" style={{ background: colorHex }} />
                <span className="text-xs font-semibold text-white/80">{COLOR_NAME[color ?? "r"]}</span>
                {pending > 0 && <span className="rounded-full bg-no px-2 py-0.5 text-[11px] font-bold text-white">+{pending} stack</span>}
              </div>
            </div>

            {/* reverse flash */}
            <AnimatePresence>
              {reversed && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.3 }}
                  className="pointer-events-none absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-lg font-black text-amber-300"
                >
                  <RotateCw size={20} className={dir === -1 ? "-scale-x-100" : ""} /> Reversed!
                </motion.div>
              )}
            </AnimatePresence>

            {/* put-down animation — a solid card flies from the player to the
                discard pile and settles exactly on it (same spot + tilt as the
                resting top card), so it reads as landing, not vanishing. */}
            <AnimatePresence>
              {fly && (
                <motion.div
                  key={fly.key}
                  className="pointer-events-none absolute left-0 top-0 z-20"
                  initial={{ x: fly.fromX, y: fly.fromY, scale: 0.86, rotate: -14, opacity: 1 }}
                  animate={{ x: flyTargetX, y: flyTargetY, scale: 1, rotate: 4, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  style={{ marginLeft: -centerCardW / 2, marginTop: -centerCard / 2 }}
                >
                  <UnoCard card={fly.card} size={centerCard} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* my hand (fanned). Playable cards lift UP with a glow — nothing is
                dimmed/transparent. Overlap is adaptive so the whole hand always
                fits the table, and corner indices keep every card readable even
                when overlapped. */}
            {!finished && (() => {
              const n = hand.length;
              const cardW = handCard * 0.68;
              const avail = (box.w || 600) * 0.9;
              // centre-to-centre spacing: spread out when there's room, tighten
              // (down to ~32% of a card) when the hand is large, never below the
              // visible corner index.
              const step = n > 1 ? clamp((avail - cardW) / (n - 1), cardW * 0.32, cardW * 0.82) : cardW;
              return (
                <div className="absolute inset-x-0 bottom-3 flex items-end justify-center" style={{ height: handCard + 44 }}>
                  {hand.map((card, i) => {
                    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
                    const rot = t * Math.min(22, n * 3.5);
                    const ok = playable(card);
                    const raise = ok ? 26 : 0;
                    return (
                      <div
                        key={i}
                        className="transition-transform duration-200"
                        style={{
                          transform: `rotate(${rot}deg) translateY(${-raise}px)`,
                          transformOrigin: "bottom center",
                          marginLeft: i === 0 ? 0 : step - cardW,
                          zIndex: ok ? 100 + i : i,
                        }}
                      >
                        <UnoCard card={card} size={handCard} selectable={ok} glow={ok} onClick={() => playCard(i)} />
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* you (turn) badge bottom-left */}
            <div className="absolute bottom-2 left-3 flex items-center gap-2">
              <div
                className={clsx("rounded-full ring-2", isMyTurn ? "ring-amber-300" : "ring-white/15")}
                style={isMyTurn ? { boxShadow: "0 0 22px rgba(251,191,36,0.6)" } : undefined}
              >
                <Avatar name={view.players?.find((p) => p.user_id === user?.id)?.username ?? "you"} size={34} />
              </div>
              {isMyTurn && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-black">YOUR TURN</span>}
            </div>
          </div>

          {/* status + actions */}
          <div
            className={clsx(
              "rounded-xl border px-4 py-2 text-center text-sm font-semibold",
              isMyTurn && !finished ? "border-brand/40 bg-brand/10 text-brand-light" : "border-border bg-bg-soft/40 text-ink-dim"
            )}
          >
            {finished
              ? view.winner_id === user?.id
                ? `You won ${formatMoney(view.pot)}! 🏆`
                : "Game over."
              : isMyTurn
                ? pending > 0
                  ? `Your turn — stack a +${view.pending_type === "wild4" ? 4 : 2} or draw ${pending}.`
                  : "Your turn — play a card or draw."
                : `Waiting for @${others.find((p) => p.user_id === view.current_user_id)?.username ?? "player"}…`}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canNudge && (
              <button onClick={() => call("uno_force_skip", { p_match: matchId })} disabled={busy} className="btn btn-ghost text-xs">
                <RotateCw size={14} /> Nudge idle player
              </button>
            )}
            {!finished && (
              <button
                onClick={() => supabase.from("arena_chat").insert({ match_id: matchId, user_id: user!.id, kind: "reaction", body: "🔴 UNO!" })}
                disabled={(view.my_hand?.length ?? 0) !== 2}
                className="btn btn-ghost text-xs disabled:opacity-40"
                title="Call it when you're down to one card"
              >
                Call UNO!
              </button>
            )}
            <div className="ml-auto">
              {finished ? (
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
            </div>
          </div>

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

// Dashed ring with two arrowheads showing the play direction.
// Shows the play direction: a faint dashed track with two tangential arrowheads
// that orbit (and point) the way turns are going — clockwise for dir 1.
function DirectionRing({ dir, color, size }: { dir: number; color: string; size: number }) {
  // At the top of the circle the clockwise tangent points right (+x); flip for ccw.
  const head = dir === 1 ? "M47 1 l11 6 l-11 6 z" : "M53 1 l-11 6 l11 6 z";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-40">
        <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
      </svg>
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        animate={{ rotate: dir === 1 ? 360 : -360 }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
      >
        <path d={head} fill={color} transform="translate(0 3)" />
        <path d={head} fill={color} transform="rotate(180 50 50) translate(0 3)" />
      </motion.svg>
    </div>
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
