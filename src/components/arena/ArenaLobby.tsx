"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Crown, Loader2, Swords, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { fetchArenaPlayers, fetchMyChallenges, fetchMyMatches } from "@/lib/arena/queries";
import { useArenaPresence } from "@/lib/arena/realtime";
import { formatMoney } from "@/lib/format";
import { FadeIn } from "@/components/motion";
import Avatar from "@/components/Avatar";
import type { ArenaChallenge } from "@/lib/arena/types";
import clsx from "clsx";

export default function ArenaLobby() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const qc = useQueryClient();
  const router = useRouter();
  const online = useArenaPresence();

  const [target, setTarget] = useState<{ id: string; username: string } | null>(null);
  const [stake, setStake] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const { data: players = [] } = useQuery({ queryKey: ["arena-players-list"], queryFn: fetchArenaPlayers });
  const { data: challenges = [] } = useQuery({ queryKey: ["arena-challenges"], queryFn: fetchMyChallenges });
  const { data: matches = [] } = useQuery({
    queryKey: ["arena-my-matches", user?.id],
    queryFn: () => fetchMyMatches(user!.id),
    enabled: !!user,
  });

  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, p.username]));
    return (id: string) => m.get(id) ?? "player";
  }, [players]);

  // Realtime: challenge + match changes. Auto-open a match when mine is accepted.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("arena-lobby-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_challenges" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["arena-challenges"] });
        const row = payload.new as ArenaChallenge | null;
        if (row && row.status === "accepted" && row.challenger_id === user.id && row.match_id) {
          refreshProfile();
          router.push(`/arena/${row.match_id}`);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_match_players" }, () =>
        qc.invalidateQueries({ queryKey: ["arena-my-matches", user.id] })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_matches" }, () =>
        qc.invalidateQueries({ queryKey: ["arena-my-matches", user.id] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, supabase, qc, router, refreshProfile]);

  const incoming = challenges.filter((c) => c.opponent_id === user?.id);
  const outgoing = challenges.filter((c) => c.challenger_id === user?.id);
  const activeMatches = matches.filter((m) => m.status === "active");
  const pastMatches = matches.filter((m) => m.status !== "active").slice(0, 8);

  const others = useMemo(() => {
    return players
      .filter((p) => p.id !== user?.id)
      .sort((a, b) => {
        const ao = online.has(a.id) ? 0 : 1;
        const bo = online.has(b.id) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return a.username.localeCompare(b.username);
      });
  }, [players, user?.id, online]);

  async function send() {
    if (!target) return;
    if (stake <= 0) {
      setErr("Stake must be greater than zero.");
      return;
    }
    if ((profile?.balance ?? 0) < stake) {
      setTarget(null);
      setInsufficient(stake);
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("arena_challenge", { p_game: "chess", p_opponent: target.id, p_stake: stake });
    setBusy(false);
    if (error) {
      if (/insufficient/i.test(error.message)) {
        setTarget(null);
        setInsufficient(stake);
      } else setErr(error.message);
      return;
    }
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["arena-challenges"] });
    setTarget(null);
  }

  async function respond(c: ArenaChallenge, accept: boolean) {
    if (accept && (profile?.balance ?? 0) < c.stake) {
      setInsufficient(c.stake);
      return;
    }
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("arena_challenge_respond", { p_challenge: c.id, p_accept: accept });
    setBusy(false);
    if (error) {
      if (/insufficient/i.test(error.message)) setInsufficient(c.stake);
      else setErr(error.message);
      return;
    }
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["arena-challenges"] });
    qc.invalidateQueries({ queryKey: ["arena-my-matches", user?.id] });
    const matchId = (data as { match_id?: string } | null)?.match_id;
    if (accept && matchId) router.push(`/arena/${matchId}`);
  }

  async function cancel(c: ArenaChallenge) {
    setBusy(true);
    const { error } = await supabase.rpc("arena_challenge_cancel", { p_challenge: c.id });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["arena-challenges"] });
  }

  if (loading || !profile) return <div className="py-20 text-center text-ink-faint">Loading…</div>;

  return (
    <FadeIn className="mx-auto flex max-w-5xl flex-col gap-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-7 sm:p-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_10%_-20%,rgba(99,102,241,0.20),transparent_60%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-ink-dim">
            <Swords size={13} className="text-brand-light" /> Head-to-head arena
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Challenge anyone. Winner takes the pot.</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-dim">
            Pick a player, set your stake, and send a challenge. When they accept, both stakes are held and the
            winner scoops the whole pot. Play-money only. Chess is live now — Uno is coming next.
          </p>
        </div>
      </section>

      {/* Incoming / outgoing challenges */}
      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {incoming.map((c) => (
            <div key={c.id} className="card flex items-center gap-3 p-4">
              <Avatar name={nameOf(c.challenger_id)} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">@{nameOf(c.challenger_id)}</div>
                <div className="text-xs text-ink-faint">challenges you · {formatMoney(c.stake)} chess</div>
              </div>
              <button onClick={() => respond(c, true)} disabled={busy} className="btn btn-primary px-3 py-1.5 text-xs">
                Accept
              </button>
              <button onClick={() => respond(c, false)} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
                Decline
              </button>
            </div>
          ))}
          {outgoing.map((c) => (
            <div key={c.id} className="card flex items-center gap-3 p-4">
              <Avatar name={nameOf(c.opponent_id)} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">@{nameOf(c.opponent_id)}</div>
                <div className="text-xs text-ink-faint">waiting · {formatMoney(c.stake)} staked</div>
              </div>
              <button onClick={() => cancel(c)} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active matches */}
      {activeMatches.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">Your matches</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {activeMatches.map((m) => (
              <Link key={m.id} href={`/arena/${m.id}`} className="card flex items-center gap-3 p-4 hover:border-border-soft">
                <Swords size={18} className="text-brand-light" />
                <div className="flex-1">
                  <div className="text-sm font-semibold capitalize">{m.game} match</div>
                  <div className="text-xs text-ink-faint">{formatMoney(m.pot)} pot · in progress</div>
                </div>
                <span className="text-xs font-semibold text-brand-light">Resume →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Players */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
          Players <span className="text-ink-faint">· {online.size} online</span>
        </h2>
        <div className="card divide-y divide-border p-0">
          {others.length === 0 && <div className="px-4 py-8 text-center text-sm text-ink-faint">No other players yet.</div>}
          {others.map((p) => {
            const isOnline = online.has(p.id);
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="relative">
                  <Avatar name={p.username} size={34} />
                  <span
                    className={clsx(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-bg-card",
                      isOnline ? "bg-emerald-400" : "bg-zinc-600"
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">@{p.username}</div>
                  <div className="text-xs text-ink-faint">{isOnline ? "online now" : "offline"}</div>
                </div>
                <button
                  onClick={() => {
                    setErr(null);
                    setTarget({ id: p.id, username: p.username });
                  }}
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                >
                  <Swords size={14} /> Challenge
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Past matches */}
      {pastMatches.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">Recent results</h2>
          <div className="card divide-y divide-border p-0">
            {pastMatches.map((m) => {
              const won = m.winner_id === user?.id;
              const label = m.status === "void" ? "Voided" : m.result === "draw" ? "Draw" : won ? "Won" : "Lost";
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Crown size={16} className={won ? "text-yellow-300" : "text-ink-faint"} />
                  <span className="flex-1 capitalize">{m.game}</span>
                  <span className="text-xs text-ink-faint">{formatMoney(m.pot)} pot</span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      won ? "bg-yes/15 text-yes-text" : m.result === "draw" || m.status === "void" ? "bg-bg-soft text-ink-dim" : "bg-no/15 text-no-text"
                    )}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Challenge modal */}
      {target && (
        <Modal onClose={() => setTarget(null)}>
          <div className="flex items-center gap-3">
            <Avatar name={target.username} size={40} />
            <div>
              <div className="text-sm text-ink-dim">Challenge</div>
              <div className="text-lg font-bold">@{target.username}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Your stake (chess)</label>
            <div className="relative">
              <Coins size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-yellow-300" />
              <input
                type="number"
                min={1}
                step="1"
                value={Number.isFinite(stake) ? stake : 0}
                onChange={(e) => setStake(Math.max(0, Math.round(parseFloat(e.target.value) || 0)))}
                className="input pl-9 font-semibold tabular-nums"
              />
            </div>
            <p className="text-xs text-ink-faint">
              Held from your balance now. Winner takes {formatMoney(stake * 2)}. Your cash: {formatMoney(profile.balance)}.
            </p>
          </div>
          {err && <p className="mt-2 text-sm text-no-text">{err}</p>}
          <button onClick={send} disabled={busy} className="btn btn-primary mt-4 w-full py-2.5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Swords size={16} />}
            Send challenge
          </button>
        </Modal>
      )}

      {/* Not enough cash */}
      {insufficient !== null && (
        <Modal onClose={() => setInsufficient(null)}>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-no/15 text-no-text">
              <Coins size={22} />
            </div>
            <h3 className="text-lg font-bold">Not enough cash</h3>
            <p className="mt-1 text-sm text-ink-dim">
              You need {formatMoney(insufficient)} to stake this match, but you only have {formatMoney(profile.balance)}.
            </p>
            <button onClick={() => setInsufficient(null)} className="btn btn-primary mt-4 w-full py-2.5">
              Got it
            </button>
          </div>
        </Modal>
      )}
    </FadeIn>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-bg-card p-5 shadow-card">
        <button onClick={onClose} className="absolute right-3 top-3 text-ink-faint hover:text-ink">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
