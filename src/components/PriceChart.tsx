"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import type { Market, Trade } from "@/lib/types";
import { priceYes } from "@/lib/lmsr";

interface Point {
  t: number;
  label: string;
  price: number; // YES %, 0..100
}

export default function PriceChart({ market, trades }: { market: Market; trades: Trade[] }) {
  const data = useMemo<Point[]>(() => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

    const pts: Point[] = [
      {
        t: new Date(market.created_at).getTime(),
        label: fmt(market.created_at),
        price: Math.round(market.initial_prob * 100),
      },
    ];
    for (const tr of trades) {
      pts.push({
        t: new Date(tr.created_at).getTime(),
        label: fmt(tr.created_at),
        price: Math.round(tr.price_after * 100),
      });
    }
    // Extend the line to "now" at the current price so it doesn't end abruptly.
    const current = Math.round(priceYes(market.q_yes, market.q_no, market.b) * 100);
    pts.push({ t: Date.now(), label: "now", price: current });
    return pts;
  }, [market, trades]);

  const current = priceYes(market.q_yes, market.q_no, market.b);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            YES price
          </div>
          <div className="text-3xl font-bold text-yes-text">{Math.round(current * 100)}¢</div>
        </div>
        <div className="text-right text-xs text-ink-faint">
          {trades.length} trade{trades.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#27ae60" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#27ae60" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#23232e" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#6b6b78", fontSize: 11 }}
              axisLine={{ stroke: "#23232e" }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fill: "#6b6b78", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#16161f",
                border: "1px solid #23232e",
                borderRadius: 12,
                color: "#f5f5f7",
                fontSize: 12,
              }}
              labelStyle={{ color: "#a1a1ac" }}
              formatter={(value: number | string) => [`${value}%`, "YES"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#27ae60"
              strokeWidth={2}
              fill="url(#yesGradient)"
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
