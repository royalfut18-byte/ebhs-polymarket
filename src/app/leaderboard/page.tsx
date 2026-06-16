"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchLeaderboard } from "@/lib/queries";
import { formatCredits } from "@/lib/format";
import Avatar from "@/components/Avatar";
import clsx from "clsx";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
  });

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
            const name = row.display_name || row.username;
            return (
              <div
                key={row.id}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3",
                  me && "bg-brand/10"
                )}
              >
                <div className="w-8 shrink-0 text-center text-lg font-bold text-ink-dim">
                  {i < 3 ? MEDALS[i] : <span className="text-sm">{i + 1}</span>}
                </div>
                <Avatar name={name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-ink">{name}</span>
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
                  <div className="truncate text-xs text-ink-faint">@{row.username}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold text-ink">{formatCredits(row.net_worth)}</div>
                  <div className="text-xs text-ink-faint">net worth</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
