"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Crown, Layers, Loader2, Plus, Swords, Users, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useOnlineUsers } from "@/components/PresenceProvider";
import {
  fetchArenaPlayers,
  fetchMyChallenges,
  fetchMyMatches,
  fetchUnoOpenTables,
} from "@/lib/arena/queries";
import { formatMoney } from "@/lib/format";
import { FadeIn } from "@/components/motion";
import Avatar from "@/components/Avatar";
import type { ArenaChallenge, ArenaMatch, UnoOpenTable } from "@/lib/arena/types";
import clsx from "clsx";

type Tab = "players" | "chess" | "uno";

export default function ArenaLobby() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const qc = useQueryClient();
  const router = useRouter();
  const online = useOnlineUsers();

  const [tab, setTab] = useState<Tab>("players");
  const [target, setTarget] = useState<{ id: string; username: string } | null>(null);
  const [stake, setStake] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<number | null>(null);
  const [unoModal, setUnoModal] = useState(false);
  const [unoStake, setUnoStake] = useState(50);
  const [unoMax, setUnoMax] = useState(4);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Polling intervals are a safety net so the lobby stays correct even if the
  // realtime websocket hiccups (which previously left challengers stuck).
  const { data: players = [] } = useQuery({
    queryKey: ["arena-players-list"],
    queryFn: fetchArenaPlayers,
    refetchInterval: 10000,
  });
  const { data: challenges = [] } = useQuery({
    queryKey: ["arena-challenges"],
    queryFn: fetchMyChallenges,
    refetchInterval: 2500,
  });
  const { data: matches = [], isSuccess: matchesLoaded } = useQuery({
    queryKey: ["arena-my-matches", user?.id],
    queryFn: () => fetchMyMatches(user!.id),
    enabled: !!user,
    refetchInterval: 2500,
  });
  const { data: unoTables = [] } = useQuery({
    queryKey: ["uno-open-tables"],
    queryFn: fetchUnoOpenTables,
    refetchInterval: 4000,
  });

  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, p.username]));
    return (id: string) => m.get(id) ?? "player";
  }, [players]);

  // Realtime invalidation (fast path). Keyed on uid so the channel isn't torn
  // down on every session refresh (that churn used to drop accepted-challenge
  // events). Navigation below is driven off the matches query as a backstop.
  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel("arena-lobby-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_challenges" }, () =>
        qc.invalidateQueries({ queryKey: ["arena-challenges"] })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_match_players" }, () =>
        qc.invalidateQueries({ queryKey: ["arena-my-matches", uid] })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "arena_matches" }, () =>
        qc.invalidateQueries({ queryKey: ["arena-my-matches", uid] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, supabase, qc]);

  // When a brand-new active match appears (someone accepted my challenge, or I
  // accepted theirs), jump straight into it. The baseline captured on first load
  // means pre-existing matches never trigger a navigation.
  const matchBaseline = useRef<Set<string> | null>(null);
  const navigated = useRef(false);
  useEffect(() => {
    if (!matchesLoaded || !uid) return;
    if (matchBaseline.current === null) {
      matchBaseline.current = new Set(matches.map((m) => m.id));
      return;
    }
    if (navigated.current) return;
    const fresh = matches.find((m) => m.status === "active" && !matchBaseline.current!.has(m.id));
    if (fresh) {
      navigated.current = true;
      refreshProfile();
      router.push(`/arena/${fresh.id}`);
    }
  }, [matches, matchesLoaded, uid, router, refreshProfile]);

  // ----- derived buckets ------------------------------------------------------
  const incoming = challenges.filter((c) => c.opponent_id === user?.id);
  const outgoing = challenges.filter((c) => c.challenger_id === user?.id);
  const chessActive = matches.filter((m) => m.game === "chess" && m.status === "active");
  const chessPast = matches.filter((m) => m.game === "chess" && m.status !== "active" && m.status !== "lobby").slice(0, 8);
  const unoActive = matches.filter((m) => m.game === "uno" && m.status === "active");
  const unoLobbies = matches.filter((m) => m.game === "uno" && m.status === "lobby");
  const unoPast = matches.filter((m) => m.game === "uno" && m.status !== "active" && m.status !== "lobby").slice(0, 8);
  const joinableTables = unoTables.filter((t) => !matches.some((m) => m.id === t.match_id));

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
  const onlineCount = others.filter((p) => online.has(p.id)).length;

  // ----- actions --------------------------------------------------------------
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
    setTab("chess");
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

  async function createUno() {
    if (unoStake <= 0) {
      setErr("Stake must be greater than zero.");
      return;
    }
    if ((profile?.balance ?? 0) < unoStake) {
      setUnoModal(false);
      setInsufficient(unoStake);
      return;
    }
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("uno_create", { p_stake: unoStake, p_max: unoMax });
    setBusy(false);
    if (error) {
      if (/insufficient/i.test(error.message)) {
        setUnoModal(false);
        setInsufficient(unoStake);
      } else setErr(error.message);
      return;
    }
    refreshProfile();
    setUnoModal(false);
    const matchId = (data as { match_id?: string } | null)?.match_id;
    if (matchId) router.push(`/arena/${matchId}`);
  }

  async function joinUno(t: UnoOpenTable) {
    if ((profile?.balance ?? 0) < t.stake) {
      setInsufficient(t.stake);
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("uno_join", { p_match: t.match_id });
    setBusy(false);
    if (error) {
      if (/insufficient/i.test(error.message)) setInsufficient(t.stake);
      else {
        setErr(error.message);
        qc.invalidateQueries({ queryKey: ["uno-open-tables"] });
      }
      return;
    }
    refreshProfile();
    router.push(`/arena/${t.match_id}`);
  }

  if (loading || !profile) return <div className="py-20 text-center text-ink-faint">Loading…</div>;

  return (
    <FadeIn className="mx-auto flex max-w-5xl flex-col gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-7 sm:p-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_10%_-20%,rgba(99,102,241,0.20),transparent_60%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-ink-dim">
            <Swords size={13} className="text-brand-light" /> Head-to-head arena
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Challenge anyone. Winner takes the pot.</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-dim">
            Challenge someone to chess, or open an Uno table for up to 8. Stakes are held when a game starts and the
            winner scoops the whole pot. Play-money only.
          </p>
        </div>
      </section>

      {/* Panel tabs */}
      <div className="flex gap-2">
        <TabButton active={tab === "players"} onClick={() => setTab("players")} icon={<Users size={15} />} label="Players" badge={onlineCount} badgeTone="online" />
        <TabButton active={tab === "chess"} onClick={() => setTab("chess")} icon={<Swords size={15} />} label="Chess" badge={incoming.length} badgeTone="alert" />
        <TabButton active={tab === "uno"} onClick={() => setTab("uno")} icon={<Layers size={15} />} label="Uno" badge={joinableTables.length} badgeTone="neutral" />
      </div>

      {/* -------- Players panel -------- */}
      {tab === "players" && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
            Players <span className="text-ink-faint">· {onlineCount} online now</span>
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
          <p className="px-1 text-xs text-ink-faint">
            A green dot means they&apos;re on the site right now — anywhere, not just the arena.
          </p>
        </div>
      )}

      {/* -------- Chess panel -------- */}
      {tab === "chess" && (
        <div className="flex flex-col gap-5">
          {incoming.length === 0 && outgoing.length === 0 && chessActive.length === 0 && chessPast.length === 0 ? (
            <EmptyPanel
              icon={<Swords size={20} className="text-brand-light" />}
              title="No chess games yet"
              hint="Head to the Players tab and challenge someone to get started."
              action={
                <button onClick={() => setTab("players")} className="btn btn-primary px-4 py-2 text-sm">
                  <Users size={15} /> Find a player
                </button>
              }
            />
          ) : (
            <>
              {(incoming.length > 0 || outgoing.length > 0) && (
                <div className="flex flex-col gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">Challenges</h2>
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
                </div>
              )}

              {chessActive.length > 0 && <MatchList title="Your games" matches={chessActive} />}
              {chessPast.length > 0 && <ResultsList title="Recent chess results" matches={chessPast} userId={user?.id} />}

              <button onClick={() => setTab("players")} className="btn btn-ghost self-start text-sm">
                <Users size={15} /> Challenge another player
              </button>
            </>
          )}
        </div>
      )}

      {/* -------- Uno panel -------- */}
      {tab === "uno" && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink-dim">
              <Layers size={15} className="text-brand-light" /> Uno tables
            </h2>
            <button
              onClick={() => {
                setErr(null);
                setUnoModal(true);
              }}
              className="btn btn-primary px-3 py-1.5 text-xs"
            >
              <Plus size={14} /> Create table
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {unoLobbies.map((m) => (
              <Link key={m.id} href={`/arena/${m.id}`} className="card flex items-center gap-3 p-4 hover:border-border-soft">
                <Layers size={18} className="text-brand-light" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">Your table</div>
                  <div className="text-xs text-ink-faint">{formatMoney(m.stake)} each · waiting to start</div>
                </div>
                <span className="text-xs font-semibold text-brand-light">Open →</span>
              </Link>
            ))}
            {unoActive.map((m) => (
              <Link key={m.id} href={`/arena/${m.id}`} className="card flex items-center gap-3 p-4 hover:border-border-soft">
                <Layers size={18} className="text-brand-light" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">Your game</div>
                  <div className="text-xs text-ink-faint">{formatMoney(m.pot)} pot · in progress</div>
                </div>
                <span className="text-xs font-semibold text-brand-light">Resume →</span>
              </Link>
            ))}
            {joinableTables.map((t) => {
              const full = t.joined >= t.max_players;
              return (
                <div key={t.match_id} className="card flex items-center gap-3 p-4">
                  <Avatar name={t.host_username ?? "host"} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">@{t.host_username ?? "host"}&apos;s table</div>
                    <div className="text-xs text-ink-faint">
                      {formatMoney(t.stake)} each · {t.joined}/{t.max_players} joined
                    </div>
                  </div>
                  <button onClick={() => joinUno(t)} disabled={busy || full} className="btn btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
                    {full ? "Full" : "Join"}
                  </button>
                </div>
              );
            })}
            {unoLobbies.length === 0 && unoActive.length === 0 && joinableTables.length === 0 && (
              <div className="card px-4 py-8 text-center text-sm text-ink-faint sm:col-span-2">
                No open Uno tables. Create one — up to 8 players, winner takes the pot.
              </div>
            )}
          </div>

          {unoPast.length > 0 && <ResultsList title="Recent Uno results" matches={unoPast} userId={user?.id} />}
        </div>
      )}

      {/* Challenge modal */}
      {target && (
        <Modal onClose={() => setTarget(null)}>
          <div className="flex items-center gap-3">
            <Avatar name={target.username} size={40} />
            <div>
              <div className="text-sm text-ink-dim">Challenge to chess</div>
              <div className="text-lg font-bold">@{target.username}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Your stake</label>
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

      {/* Create Uno table */}
      {unoModal && (
        <Modal onClose={() => setUnoModal(false)}>
          <div className="flex items-center gap-2">
            <Layers size={20} className="text-brand-light" />
            <div className="text-lg font-bold">New Uno table</div>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Stake per player</label>
            <div className="relative">
              <Coins size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-yellow-300" />
              <input
                type="number"
                min={1}
                step="1"
                value={Number.isFinite(unoStake) ? unoStake : 0}
                onChange={(e) => setUnoStake(Math.max(0, Math.round(parseFloat(e.target.value) || 0)))}
                className="input pl-9 font-semibold tabular-nums"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Max players</label>
            <div className="flex gap-2">
              {[2, 4, 6, 8].map((n) => (
                <button key={n} onClick={() => setUnoMax(n)} className={clsx("btn flex-1", unoMax === n ? "btn-primary" : "btn-ghost")}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Your stake is held now. Everyone who joins adds the same stake; the first player to empty their hand takes the
            whole pot. Your cash: {formatMoney(profile.balance)}.
          </p>
          {err && <p className="mt-2 text-sm text-no-text">{err}</p>}
          <button onClick={createUno} disabled={busy} className="btn btn-primary mt-4 w-full py-2.5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Create &amp; open table
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
              You need {formatMoney(insufficient)} to stake this, but you only have {formatMoney(profile.balance)}.
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

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeTone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  badgeTone: "online" | "alert" | "neutral";
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
        active ? "border-brand/40 bg-brand/15 text-ink" : "border-border bg-bg-soft/40 text-ink-dim hover:text-ink"
      )}
    >
      {icon}
      {label}
      {!!badge && badge > 0 && (
        <span
          className={clsx(
            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
            badgeTone === "online" && "bg-emerald-500/20 text-emerald-300",
            badgeTone === "alert" && "bg-no text-white",
            badgeTone === "neutral" && "bg-bg-hover text-ink-dim"
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function MatchList({ title, matches }: { title: string; matches: ArenaMatch[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {matches.map((m) => (
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
  );
}

function ResultsList({ title, matches, userId }: { title: string; matches: ArenaMatch[]; userId?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">{title}</h2>
      <div className="card divide-y divide-border p-0">
        {matches.map((m) => {
          const won = m.winner_id === userId;
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
  );
}

function EmptyPanel({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm text-ink-faint">{hint}</div>
      </div>
      {action}
    </div>
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
