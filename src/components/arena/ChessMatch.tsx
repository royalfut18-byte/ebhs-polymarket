"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { ArrowLeft, Coins, Flag, Handshake, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { fetchMatch, fetchMatchPlayers } from "@/lib/arena/queries";
import { usePgSubscription } from "@/lib/arena/realtime";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import { FadeIn } from "@/components/motion";
import ChessBoard, { type BoardMove } from "./ChessBoard";
import MatchChat from "./MatchChat";
import clsx from "clsx";

const TIMEOUT_MS = 2 * 60 * 1000; // opponent abandonment
const CLAIM_GRACE_MS = 20 * 1000; // wait before claiming an unconfirmed result

export default function ChessMatch({ matchId }: { matchId: string }) {
  const { user, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const { data: match, isLoading, isError } = useQuery({
    queryKey: ["arena-match", matchId],
    queryFn: () => fetchMatch(matchId),
    refetchInterval: 2500, // realtime fallback so moves still sync if a push is missed
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
  const opp = players.find((p) => p.user_id !== user?.id);
  const myRole = (me?.role as "white" | "black" | undefined) ?? "white";

  const chess = useMemo(() => {
    if (!match) return null;
    try {
      return new Chess(match.state.fen);
    } catch {
      return null;
    }
  }, [match]);

  const pending = match?.state?.pending ?? null;
  const lastMove = useMemo(() => {
    const moves = match?.state?.moves ?? [];
    const last = moves[moves.length - 1];
    return last ? { from: last.from, to: last.to } : null;
  }, [match]);

  const myTurnChar = myRole === "white" ? "w" : "b";
  const isMyTurn = !!chess && match?.status === "active" && !pending && chess.turn() === myTurnChar;

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
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setErr(msg);
      qc.invalidateQueries({ queryKey: ["arena-match", matchId] }); // revert optimistic
    } finally {
      setBusy(false);
    }
  }

  function handleMove(mv: BoardMove) {
    if (!match || !user || busy || !isMyTurn) return;
    const game = new Chess(match.state.fen);
    let res;
    try {
      res = game.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    } catch {
      return;
    }
    if (!res) return;
    const newFen = game.fen();
    let terminal: string | null = null;
    if (game.isCheckmate()) terminal = "checkmate";
    else if (game.isGameOver()) terminal = "draw";

    const optimisticPending = terminal
      ? {
          type: terminal === "checkmate" ? ("checkmate" as const) : ("draw" as const),
          by: user.id,
          winner: terminal === "checkmate" ? user.id : null,
          at: new Date().toISOString(),
        }
      : null;

    qc.setQueryData(["arena-match", matchId], (old: typeof match | undefined) =>
      old
        ? {
            ...old,
            state: {
              ...old.state,
              fen: newFen,
              moves: [
                ...(old.state.moves ?? []),
                { from: mv.from, to: mv.to, promotion: mv.promotion ?? null, san: res.san },
              ],
              last_move_at: new Date().toISOString(),
              draw_offer: null,
              pending: optimisticPending,
            },
          }
        : old
    );

    call("arena_chess_move", {
      p_match: matchId,
      p_from: mv.from,
      p_to: mv.to,
      p_promotion: mv.promotion ?? null,
      p_san: res.san,
      p_fen: newFen,
      p_terminal: terminal,
    });
  }

  // Auto-confirm (or dispute) a result the opponent declared, by re-deriving the
  // terminal state from the agreed-on position with our own engine.
  const handledPending = useRef<string | null>(null);
  useEffect(() => {
    if (!match || match.status !== "active" || !pending || !user) return;
    if (pending.by === user.id) return; // we declared it — we wait
    const sig = `${pending.by}|${pending.at}`;
    if (handledPending.current === sig) return;
    handledPending.current = sig;
    let agree = false;
    try {
      const g = new Chess(match.state.fen);
      agree = pending.type === "checkmate" ? g.isCheckmate() : g.isGameOver() && !g.isCheckmate();
    } catch {
      agree = false;
    }
    call("arena_chess_confirm", { p_match: matchId, p_agree: agree });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.by, pending?.at, match?.status]);

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
  if (isError || !match)
    return (
      <div className="py-20 text-center text-ink-dim">
        Match not found.{" "}
        <Link href="/arena" className="text-brand-light hover:underline">
          Back to arena
        </Link>
      </div>
    );

  const drawOffer = match.state.draw_offer;
  const drawFromOpp = drawOffer && opp && drawOffer === opp.user_id;
  const drawFromMe = drawOffer && drawOffer === user?.id;

  const sinceLast = now - new Date(match.state.last_move_at ?? match.created_at).getTime();
  const oppOnClock = match.status === "active" && !pending && !!chess && chess.turn() !== myTurnChar;
  const canClaimTimeout = oppOnClock && sinceLast > TIMEOUT_MS;

  const iDeclared = pending && pending.by === user?.id;
  const canClaimResult = iDeclared && now - new Date(pending!.at).getTime() > CLAIM_GRACE_MS;

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
          {/* opponent header */}
          <PlayerBar
            name={opp?.profiles?.username ?? "Opponent"}
            role={opp?.role}
            toMove={!!chess && match.status === "active" && chess.turn() !== myTurnChar}
          />

          <ChessBoard
            fen={match.state.fen}
            orientation={myRole}
            canMove={isMyTurn && !busy}
            lastMove={lastMove}
            onMove={handleMove}
          />

          {/* me header */}
          <PlayerBar
            name={me?.profiles?.username ?? "You"}
            role={me?.role}
            toMove={isMyTurn}
            you
          />

          {/* status / result */}
          <StatusBanner match={match} meId={user?.id} />

          {/* live action buttons */}
          {match.status === "active" && (
            <div className="flex flex-col gap-2">
              {drawFromOpp && (
                <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 p-2.5 text-sm">
                  <span className="flex-1">Opponent offers a draw.</span>
                  <button onClick={() => call("arena_draw_respond", { p_match: matchId, p_accept: true })} className="btn btn-primary px-3 py-1.5 text-xs">
                    Accept
                  </button>
                  <button onClick={() => call("arena_draw_respond", { p_match: matchId, p_accept: false })} className="btn btn-ghost px-3 py-1.5 text-xs">
                    Decline
                  </button>
                </div>
              )}

              {iDeclared && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-soft/60 p-2.5 text-sm">
                  <Loader2 size={15} className="animate-spin text-ink-faint" />
                  <span className="flex-1">Waiting for your opponent to confirm the result…</span>
                  {canClaimResult && (
                    <button onClick={() => call("arena_chess_claim", { p_match: matchId })} disabled={busy} className="btn btn-primary px-3 py-1.5 text-xs">
                      Claim {match.state.pending?.type === "draw" ? "draw" : "win"}
                    </button>
                  )}
                </div>
              )}

              {canClaimTimeout && (
                <button onClick={() => call("arena_claim_timeout", { p_match: matchId })} disabled={busy} className="btn btn-primary">
                  Claim win — opponent abandoned
                </button>
              )}

              {!pending && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (confirm("Resign this match? Your opponent takes the pot.")) call("arena_resign", { p_match: matchId });
                    }}
                    disabled={busy}
                    className="btn btn-ghost flex-1 text-no-text"
                  >
                    <Flag size={15} /> Resign
                  </button>
                  <button
                    onClick={() => call("arena_draw_offer", { p_match: matchId })}
                    disabled={busy || !!drawFromMe}
                    className="btn btn-ghost flex-1"
                  >
                    <Handshake size={15} /> {drawFromMe ? "Draw offered" : "Offer draw"}
                  </button>
                </div>
              )}

              {oppOnClock && !canClaimTimeout && (
                <p className="text-center text-xs text-ink-faint">
                  Opponent on the clock — you can claim the win if they&apos;re idle for{" "}
                  {Math.max(0, Math.ceil((TIMEOUT_MS - sinceLast) / 1000))}s more.
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
  role,
  toMove,
  you,
}: {
  name: string;
  role?: string | null;
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
      <span className={clsx("h-3 w-3 rounded-full ring-1 ring-white/20", role === "white" ? "bg-white" : "bg-zinc-900")} />
      <span className="font-semibold">
        {name}
        {you && <span className="text-ink-faint"> (you)</span>}
      </span>
      <span className="ml-auto text-xs capitalize text-ink-faint">{role}</span>
      {toMove && <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-bold text-brand-light">to move</span>}
    </div>
  );
}

function StatusBanner({ match, meId }: { match: { status: string; result: string | null; winner_id: string | null; pot: number }; meId?: string }) {
  if (match.status === "active") return null;
  let text: string;
  let tone: "win" | "lose" | "neutral" = "neutral";
  if (match.status === "void") {
    text = "Match voided — both stakes refunded.";
  } else if (match.result === "draw") {
    text = "Draw — stakes returned.";
  } else if (match.winner_id === meId) {
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
