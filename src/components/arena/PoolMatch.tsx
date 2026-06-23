"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, Flag, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { fetchMatch, fetchMatchPlayers } from "@/lib/arena/queries";
import { usePgSubscription } from "@/lib/arena/realtime";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import { FadeIn } from "@/components/motion";
import { simulate } from "@/lib/arena/pool/physics";
import { resolveShot } from "@/lib/arena/pool/rules";
import PoolTable from "./PoolTable";
import MatchChat from "./MatchChat";
import type { PoolGroup, PoolState } from "@/lib/arena/types";
import clsx from "clsx";

const TIMEOUT_MS = 2 * 60 * 1000;
const CLAIM_GRACE_MS = 20 * 1000;

export default function PoolMatch({ matchId }: { matchId: string }) {
  const { user, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const { data: match, isLoading, isError } = useQuery({
    queryKey: ["arena-match", matchId],
    queryFn: () => fetchMatch(matchId),
    refetchInterval: 2000,
  });
  const { data: players = [] } = useQuery({
    queryKey: ["arena-players", matchId],
    queryFn: () => fetchMatchPlayers(matchId),
  });

  usePgSubscription(`match-${matchId}`, "arena_matches", `id=eq.${matchId}`, () =>
    qc.invalidateQueries({ queryKey: ["arena-match", matchId] })
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const me = players.find((p) => p.user_id === user?.id);
  const mySeat = me?.seat ?? 0;
  const opp = players.find((p) => p.user_id !== user?.id);
  const state = (match?.state ?? null) as PoolState | null;
  const seatUser = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of players) m.set(p.seat, p.user_id);
    return m;
  }, [players]);

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc(fn, args);
      if (error) throw new Error(error.message);
      refreshProfile();
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["arena-match", matchId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      qc.invalidateQueries({ queryKey: ["arena-match", matchId] });
    } finally {
      setBusy(false);
    }
  }

  function handleShoot(after: PoolState, winnerSeat: number | null) {
    if (!match || !user) return;
    const winnerId = winnerSeat != null ? seatUser.get(winnerSeat) ?? null : null;
    // optimistic
    qc.setQueryData(["arena-match", matchId], (old: typeof match | undefined) =>
      old ? { ...old, state: after } : old
    );
    call("arena_pool_shoot", { p_match: matchId, p_state: after, p_winner: winnerId });
  }

  // Auto-confirm (or dispute) a win the opponent declared, by replaying their
  // shot with our own engine and re-deriving the winner.
  const handledPending = useRef<string | null>(null);
  useEffect(() => {
    if (!match || match.status !== "active" || !state?.pending || !user || players.length < 2) return;
    if (state.pending.by === user.id) return; // we declared it — we wait
    const sig = `${state.pending.by}|${state.pending.at}`;
    if (handledPending.current === sig) return;
    handledPending.current = sig;

    let agree = false;
    try {
      const ls = state.lastShot!;
      const shooterSeat = players.find((p) => p.user_id === ls.by)?.seat ?? 0;
      const before: PoolState = {
        balls: ls.pre,
        turn: shooterSeat,
        groups: ls.groups,
        phase: ls.phase,
        ballInHand: false,
        lastShot: null,
        pending: null,
      };
      const { final, events } = simulate(ls.pre, ls.vx, ls.vy);
      const { winnerSeat } = resolveShot(before, final, events, shooterSeat, {
        by: ls.by,
        pre: ls.pre,
        vx: ls.vx,
        vy: ls.vy,
      });
      const winnerId = winnerSeat != null ? seatUser.get(winnerSeat) ?? null : null;
      agree = winnerId != null && winnerId === state.pending.winner;
    } catch {
      agree = false;
    }
    call("arena_pool_confirm", { p_match: matchId, p_agree: agree });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.pending?.by, state?.pending?.at, match?.status, players.length]);

  // Celebrate a win once.
  const celebrated = useRef(false);
  useEffect(() => {
    if (match?.status === "finished" && match.winner_id === user?.id && !celebrated.current) {
      celebrated.current = true;
      celebrate(true);
      refreshProfile();
    }
  }, [match?.status, match?.winner_id, user?.id, refreshProfile]);

  if (isLoading) return <div className="py-20 text-center text-ink-faint">Loading match…</div>;
  if (isError || !match || !state)
    return (
      <div className="py-20 text-center text-ink-dim">
        Match not found.{" "}
        <Link href="/arena" className="text-brand-light hover:underline">
          Back to arena
        </Link>
      </div>
    );

  const myTurn = match.status === "active" && !state.pending && state.turn === mySeat;
  const myGroup = state.groups[String(mySeat)] as PoolGroup | null;
  const oppSeat = mySeat === 0 ? 1 : 0;
  const iDeclared = state.pending && state.pending.by === user?.id;
  const canClaimResult = iDeclared && now - new Date(state.pending!.at).getTime() > CLAIM_GRACE_MS;
  const sinceShot = now - new Date(state.last_shot_at ?? match.created_at).getTime();
  const oppOnClock = match.status === "active" && !state.pending && state.turn === oppSeat;
  const canClaimTimeout = oppOnClock && sinceShot > TIMEOUT_MS;

  return (
    <FadeIn className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/arena" className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink">
          <ArrowLeft size={16} /> Arena
        </Link>
        <div className="flex items-center gap-2 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.07] px-3 py-1.5 text-sm">
          <Coins size={15} className="text-yellow-300" />
          <span className="font-semibold tabular-nums">{formatMoney(match.pot)} pot</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          <PlayerBar
            name={opp?.profiles?.username ?? "Opponent"}
            group={state.groups[String(oppSeat)] as PoolGroup | null}
            toMove={match.status === "active" && state.turn === oppSeat && !state.pending}
          />

          <PoolTable state={state} mySeat={mySeat} meId={user!.id} canPlay={myTurn && !busy} onShoot={handleShoot} />

          <PlayerBar name={me?.profiles?.username ?? "You"} group={myGroup} toMove={myTurn} you />

          <StatusBanner match={match} meId={user?.id} phase={state.phase} />

          {match.status === "active" && (
            <div className="flex flex-col gap-2">
              {iDeclared && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-soft/60 p-2.5 text-sm">
                  <Loader2 size={15} className="animate-spin text-ink-faint" />
                  <span className="flex-1">Waiting for your opponent to confirm…</span>
                  {canClaimResult && (
                    <button onClick={() => call("arena_pool_claim", { p_match: matchId })} disabled={busy} className="btn btn-primary px-3 py-1.5 text-xs">
                      Claim win
                    </button>
                  )}
                </div>
              )}

              {canClaimTimeout && (
                <button onClick={() => call("arena_pool_claim_timeout", { p_match: matchId })} disabled={busy} className="btn btn-primary">
                  Claim win — opponent abandoned
                </button>
              )}

              {!state.pending && (
                <button
                  onClick={() => {
                    if (confirm("Resign this match? Your opponent takes the pot.")) call("arena_resign", { p_match: matchId });
                  }}
                  disabled={busy}
                  className="btn btn-ghost self-start text-no-text"
                >
                  <Flag size={15} /> Resign
                </button>
              )}

              {oppOnClock && !canClaimTimeout && (
                <p className="text-center text-xs text-ink-faint">
                  Opponent on the clock — you can claim if they&apos;re idle for{" "}
                  {Math.max(0, Math.ceil((TIMEOUT_MS - sinceShot) / 1000))}s more.
                </p>
              )}
            </div>
          )}

          {err && <p className="text-center text-sm text-no-text">{err}</p>}
        </div>

        <div className="min-h-[420px]">
          <MatchChat matchId={matchId} players={players} />
        </div>
      </div>
    </FadeIn>
  );
}

function PlayerBar({
  name,
  group,
  toMove,
  you,
}: {
  name: string;
  group: PoolGroup | null;
  toMove?: boolean;
  you?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
        toMove ? "border-brand/40 bg-brand/10" : "border-border bg-bg-soft/40"
      )}
    >
      <span className="font-semibold">
        {name}
        {you && <span className="text-ink-faint"> (you)</span>}
      </span>
      <span className="ml-2 text-xs capitalize text-ink-faint">{group ?? "open"}</span>
      {toMove && <span className="ml-auto rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-bold text-brand-light">to shoot</span>}
    </div>
  );
}

function StatusBanner({
  match,
  meId,
  phase,
}: {
  match: { status: string; result: string | null; winner_id: string | null; pot: number };
  meId?: string;
  phase: string;
}) {
  if (match.status === "active") {
    if (phase === "break") return <Hint>Break shot — smash the rack to start.</Hint>;
    if (phase === "open") return <Hint>Table is open — pot a ball to claim solids or stripes.</Hint>;
    return null;
  }
  let text: string;
  let tone: "win" | "lose" | "neutral" = "neutral";
  if (match.status === "void") text = "Match voided — both stakes refunded.";
  else if (match.winner_id === meId) {
    text = `You won ${formatMoney(match.pot)}! 🏆`;
    tone = "win";
  } else {
    text = "You lost this one.";
    tone = "lose";
  }
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 text-center text-sm font-semibold",
        tone === "win" && "border-yes/30 bg-yes/10 text-yes-text",
        tone === "lose" && "border-no/30 bg-no/10 text-no-text",
        tone === "neutral" && "border-border bg-bg-soft/60 text-ink-dim"
      )}
    >
      {text}{" "}
      <Link href="/arena" className="underline">
        Back to arena
      </Link>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-bg-soft/40 px-4 py-2 text-center text-sm text-ink-dim">
      {children}
    </div>
  );
}
