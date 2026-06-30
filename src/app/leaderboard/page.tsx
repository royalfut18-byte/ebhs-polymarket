"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Crown, Gift, Trophy } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchLeaderboard, fetchPastWinners, fetchPrizes } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import type { LeaderboardRow } from "@/lib/types";
import Avatar from "@/components/Avatar";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import clsx from "clsx";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
  });
  const { data: prizes } = useQuery({ queryKey: ["prizes"], queryFn: fetchPrizes });
  const { data: pastWinners = [] } = useQuery({ queryKey: ["past-winners"], queryFn: fetchPastWinners });

  const hasPodium = data.length >= 3;
  const top3 = hasPodium ? data.slice(0, 3) : [];
  const rest = hasPodium ? data.slice(3) : data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <FadeIn>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400/25 to-yellow-600/10 text-yellow-300 ring-1 ring-yellow-400/20">
            <Trophy size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
            <p className="text-sm text-ink-dim">Ranked by total play-money net worth.</p>
          </div>
        </div>
      </FadeIn>

      {prizes && prizes.entries && prizes.entries.length > 0 && (
        <FadeIn delay={0.05}>
          <div className="relative overflow-hidden rounded-2xl border border-yellow-400/25 bg-gradient-to-br from-yellow-400/[0.12] to-transparent p-5">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-yellow-400/15 blur-3xl" />
            <div className="relative mb-3 flex items-center gap-2 text-yellow-300">
              <Gift size={18} />
              <h2 className="text-base font-bold">{prizes.title || "Prizes"}</h2>
            </div>
            <ul className="relative flex flex-col gap-2">
              {prizes.entries.map((e, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="min-w-[96px] font-semibold text-ink">
                    {MEDALS[i] ?? "🏅"} {e.place}
                  </span>
                  <span className="text-ink-dim">{e.reward}</span>
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>
      )}

      {isLoading ? (
        <div className="card py-16 text-center text-sm text-ink-faint">Loading…</div>
      ) : isError ? (
        <div className="card py-16 text-center text-sm text-ink-dim">
          Couldn&apos;t load the leaderboard. Check your Supabase configuration.
        </div>
      ) : data.length === 0 ? (
        <div className="card py-16 text-center text-sm text-ink-dim">No players yet.</div>
      ) : (
        <>
          {hasPodium && (
            <FadeIn delay={0.1}>
              <div className="grid grid-cols-3 items-end gap-3">
                <PodiumCard row={top3[1]} place={2} me={profile?.id} />
                <PodiumCard row={top3[0]} place={1} me={profile?.id} />
                <PodiumCard row={top3[2]} place={3} me={profile?.id} />
              </div>
            </FadeIn>
          )}

          {rest.length > 0 && (
            <Stagger className="card divide-y divide-border overflow-hidden">
              {rest.map((row, i) => {
                const rank = (hasPodium ? 3 : 0) + i + 1;
                const me = profile?.id === row.id;
                return (
                  <StaggerItem key={row.id}>
                    <Link
                      href={`/u/${row.username}`}
                      className={clsx(
                        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]",
                        me && "bg-brand/10"
                      )}
                    >
                      <div className="w-7 shrink-0 text-center text-sm font-bold text-ink-faint">
                        {rank}
                      </div>
                      <Avatar name={row.username} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-ink">@{row.username}</span>
                          {me && (
                            <span className="rounded-full bg-brand/20 px-2 py-0.5 text-xs font-medium text-brand-light">
                              You
                            </span>
                          )}
                          {row.role !== "user" && (
                            <>
                              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium capitalize text-ink-dim">
                                {row.role}
                              </span>
                              <span className="shrink-0 text-[11px] font-medium italic text-ink-faint">
                                (ineligible for prize)
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-bold text-ink">{formatMoney(row.net_worth)}</div>
                        <div className="text-xs text-ink-faint">net worth</div>
                      </div>
                    </Link>
                  </StaggerItem>
                );
              })}
            </Stagger>
          )}
        </>
      )}

      {pastWinners.length > 0 && (
        <FadeIn delay={0.15}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Crown size={18} className="text-yellow-300" />
              <h2 className="text-lg font-bold tracking-tight">Hall of Fame</h2>
            </div>
            <div className="flex flex-col gap-3">
              {pastWinners.map((m, i) => (
                <div key={i} className="card overflow-hidden p-4">
                  <div className="mb-2.5 text-sm font-bold text-ink-dim">{m.month}</div>
                  <ul className="flex flex-col gap-1.5">
                    {m.winners.map((w, j) => (
                      <li key={j} className="flex items-center gap-2.5 text-sm">
                        <span className="w-7 shrink-0 text-center text-base leading-none">
                          {MEDALS[j] ?? "🏅"}
                        </span>
                        <Link href={`/u/${w.username}`} className="font-semibold text-ink hover:underline">
                          @{w.username}
                        </Link>
                        <span className="text-xs text-ink-faint">{w.place}</span>
                        {w.prize && <span className="ml-auto text-xs font-medium text-yellow-300">{w.prize}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}

function PodiumCard({
  row,
  place,
  me,
}: {
  row: LeaderboardRow;
  place: 1 | 2 | 3;
  me?: string;
}) {
  if (!row) return <div />;
  const isFirst = place === 1;
  const isMe = me === row.id;
  return (
    <Link
      href={`/u/${row.username}`}
      className={clsx(
        "group relative flex flex-col items-center gap-1.5 rounded-2xl border p-4 text-center transition-all hover:-translate-y-1",
        isFirst
          ? "border-yellow-400/30 bg-gradient-to-b from-yellow-400/[0.14] to-transparent pb-7 pt-6 shadow-[0_0_40px_-12px_rgba(250,204,21,0.5)]"
          : "border-border bg-white/[0.03]",
        isMe && "ring-1 ring-brand/50"
      )}
    >
      <div className={clsx("leading-none", isFirst ? "text-4xl" : "text-3xl")}>
        {MEDALS[place - 1]}
      </div>
      <Avatar name={row.username} size={isFirst ? 52 : 42} />
      <div className="mt-1 w-full truncate text-sm font-semibold text-ink">@{row.username}</div>
      {row.role !== "user" && (
        <div className="text-[10px] font-medium italic leading-tight text-ink-faint">(ineligible for prize)</div>
      )}
      <div className={clsx("font-bold", isFirst ? "text-lg text-yellow-200" : "text-ink")}>
        {formatMoney(row.net_worth)}
      </div>
    </Link>
  );
}
