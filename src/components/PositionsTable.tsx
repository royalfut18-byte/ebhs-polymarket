"use client";

import Link from "next/link";
import type { EnrichedPosition } from "@/lib/pnl";
import { formatMoney, formatShares, signedMoney, signedPct, toCents } from "@/lib/format";
import clsx from "clsx";

export default function PositionsTable({ rows }: { rows: EnrichedPosition[] }) {
  if (rows.length === 0) {
    return (
      <div className="card py-10 text-center text-sm text-ink-dim">
        No open positions.{" "}
        <Link href="/" className="text-brand-light hover:underline">
          Find a market →
        </Link>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
            <th className="px-4 py-3 font-medium">Market</th>
            <th className="px-4 py-3 font-medium">Bet</th>
            <th className="px-4 py-3 text-right font-medium">Shares</th>
            <th className="px-4 py-3 text-right font-medium">Avg</th>
            <th className="px-4 py-3 text-right font-medium">Now</th>
            <th className="px-4 py-3 text-right font-medium">Value</th>
            <th className="px-4 py-3 text-right font-medium">Profit/Loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, m, price, value, pnl, pnlPct }) => {
            const up = pnl >= 0;
            return (
              <tr key={p.id} className="border-b border-border/60 last:border-0">
                <td className="max-w-[240px] px-4 py-3">
                  <Link href={`/market/${m.id}`} className="line-clamp-1 hover:text-brand">
                    {m.option_label ? m.group_title || m.question : m.question}
                  </Link>
                  {m.option_label && (
                    <span className="text-xs text-ink-faint">{m.option_label}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      p.outcome === "yes" ? "bg-yes/15 text-yes-text" : "bg-no/15 text-no-text"
                    )}
                  >
                    {p.outcome.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatShares(p.shares)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-dim">
                  {toCents(p.avg_price)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{toCents(price)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {formatMoney(value)}
                </td>
                <td
                  className={clsx(
                    "px-4 py-3 text-right font-semibold tabular-nums",
                    up ? "text-yes-text" : "text-no-text"
                  )}
                >
                  {signedMoney(pnl)}
                  <span className="ml-1 text-xs font-medium opacity-80">({signedPct(pnlPct)})</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
