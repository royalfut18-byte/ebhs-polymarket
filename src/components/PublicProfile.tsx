"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import { fetchProfileByUsername, fetchUserPositions } from "@/lib/queries";
import { enrichPositions, summarize } from "@/lib/pnl";
import { formatMoney, signedMoney, signedPct } from "@/lib/format";
import Avatar from "./Avatar";
import PositionsTable from "./PositionsTable";
import { FadeIn } from "./motion";
import clsx from "clsx";

export default function PublicProfile({ username }: { username: string }) {
  const profileQuery = useQuery({
    queryKey: ["public-profile", username.toLowerCase()],
    queryFn: () => fetchProfileByUsername(username),
  });
  const profile = profileQuery.data;

  const positionsQuery = useQuery({
    queryKey: ["public-positions", profile?.id],
    enabled: !!profile,
    queryFn: () => fetchUserPositions(profile!.id),
  });

  if (profileQuery.isLoading) {
    return <div className="py-20 text-center text-ink-faint">Loading…</div>;
  }
  if (profileQuery.isError || !profile) {
    return (
      <div className="card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 py-14 text-center">
        <h1 className="text-lg font-semibold">User not found</h1>
        <Link href="/leaderboard" className="btn btn-ghost">
          Back to leaderboard
        </Link>
      </div>
    );
  }

  const enriched = enrichPositions(positionsQuery.data ?? []);
  const s = summarize(enriched, profile.balance);
  const up = s.totalPnl >= 0;

  return (
    <FadeIn className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link
        href="/leaderboard"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
      >
        <ArrowLeft size={16} /> Leaderboard
      </Link>

      <div className="card flex items-center gap-4 p-5">
        <Avatar name={profile.username} size={60} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold">@{profile.username}</h1>
            {profile.role !== "user" && (
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium capitalize text-ink-dim">
                {profile.role}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm">
            <span className="text-ink-dim">P/L</span>
            {up ? (
              <TrendingUp size={14} className="text-yes-text" />
            ) : (
              <TrendingDown size={14} className="text-no-text" />
            )}
            <span className={clsx("font-semibold", up ? "text-yes-text" : "text-no-text")}>
              {signedMoney(s.totalPnl)} ({signedPct(s.totalPct)})
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Net worth" value={formatMoney(s.netWorth)} />
        <Stat label="Positions" value={formatMoney(s.positionsValue)} />
        <Stat
          label="All-time P/L"
          value={signedMoney(s.totalPnl)}
          tone={up ? "up" : "down"}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Open positions
        </h2>
        {positionsQuery.isLoading ? (
          <div className="card py-10 text-center text-sm text-ink-faint">Loading…</div>
        ) : (
          <PositionsTable rows={enriched} />
        )}
      </section>
    </FadeIn>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      <div
        className={clsx(
          "mt-1 text-lg font-bold tabular-nums",
          tone === "up" ? "text-yes-text" : tone === "down" ? "text-no-text" : "text-ink"
        )}
      >
        {value}
      </div>
    </div>
  );
}
