"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Gift, Trophy } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchLeaderboard, fetchPrizes } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import Avatar from "@/components/Avatar";
import clsx from "clsx";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
  });
  const { data: prizes } = useQuery({ queryKey: ["prizes"], queryFn: fetchPrizes });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/15 text-yellow-300">
          <Trophy size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-ink-dim">Ranked by total play-money net worth.</p>
        </div>
      </div>

      {prizes && prizes.entries && prizes.entries.length > 0 && (
        <div className="card border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-transparent p-5">
          <div className="mb-3 flex items-center gap-2 text-yellow-300">
            <Gift size={18} />
            <h2 className="text-base font-bold">{prizes.title || "Prizes"}</h2>
          </div>
          <ul className="flex flex-col gap-2">
            {prizes.entries.map((e, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="min-w-[90px] font-semibold text-ink">
                  {MEDALS[i] ?? "🏅"} {e.place}
                </span>
                <span className="text-ink-dim">{e.reward}</span>
              </li>
            ))}
          </ul>
        </div>
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
        <div className="card divide-y divide-border">
          {data.map((row, i) => {
            const me = profile?.id === row.id;
            return (
              <Link
                href={`/u/${row.username}`}
                key={row.id}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-hover",
                  me && "bg-brand/10"
                )}
              >
                <div className="w-8 shrink-0 text-center text-lg font-bold text-ink-dim">
                  {i < 3 ? MEDALS[i] : <span className="text-sm">{i + 1}</span>}
                </div>
                <Avatar name={row.username} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-ink">@{row.username}</span>
                    {me && (
                      <span className="rounded-full bg-brand/20 px-2 py-0.5 text-xs font-medium text-brand">
                        You
                      </span>
                    )}
                    {row.role !== "user" && (
                      <span className="rounded-full bg-bg-hover px-2 py-0.5 text-xs font-medium capitalize text-ink-dim">
                        {row.role}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold text-ink">{formatMoney(row.net_worth)}</div>
                  <div className="text-xs text-ink-faint">net worth</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
