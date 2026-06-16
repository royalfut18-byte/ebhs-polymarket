"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { fetchProfileByUsername, fetchUserPositions } from "@/lib/queries";
import { priceOf } from "@/lib/lmsr";
import { formatMoney, formatShares, toCents } from "@/lib/format";
import Avatar from "./Avatar";
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

  const positions = (positionsQuery.data ?? []).filter((p) => p.markets);
  const enriched = positions.map((p) => {
    const m = p.markets!;
    const price = priceOf(p.outcome, m.q_yes, m.q_no, m.b);
    return { p, m, price, value: p.shares * price };
  });
  const positionsValue = enriched.reduce((s, e) => s + e.value, 0);
  const netWorth = profile.balance + positionsValue;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link
        href="/leaderboard"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
      >
        <ArrowLeft size={16} /> Leaderboard
      </Link>

      <div className="card flex items-center gap-4 p-5">
        <Avatar name={profile.username} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold">@{profile.username}</h1>
            {profile.role !== "user" && (
              <span className="rounded-full bg-bg-hover px-2 py-0.5 text-xs font-medium capitalize text-ink-dim">
                {profile.role}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-ink-dim">
            Net worth <span className="font-semibold text-ink">{formatMoney(netWorth)}</span>
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Open positions
        </h2>
        {positionsQuery.isLoading ? (
          <div className="card py-10 text-center text-sm text-ink-faint">Loading…</div>
        ) : enriched.length === 0 ? (
          <div className="card py-10 text-center text-sm text-ink-dim">No open positions.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-medium">Market</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 text-right font-medium">Shares</th>
                  <th className="px-4 py-3 text-right font-medium">Now</th>
                  <th className="px-4 py-3 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map(({ p, m, price, value }) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[240px] px-4 py-3">
                      <Link href={`/market/${m.id}`} className="line-clamp-1 hover:text-brand">
                        {m.question}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          p.outcome === "yes"
                            ? "bg-yes/15 text-yes-text"
                            : "bg-no/15 text-no-text"
                        )}
                      >
                        {p.outcome.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatShares(p.shares)}</td>
                    <td className="px-4 py-3 text-right">{toCents(price)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
