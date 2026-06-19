"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import {
  bucketColor,
  plinkoMultipliers,
  PLINKO_RISKS,
  PLINKO_MIN_ROWS,
  PLINKO_MAX_ROWS,
  type PlinkoRisk,
} from "@/lib/casino/plinko";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import clsx from "clsx";

interface PlinkoResult {
  rows: number;
  risk: PlinkoRisk;
  bucket: number;
  path: number[];
  multiplier: number;
  payout: number;
  win: boolean;
}

interface Ball {
  id: number;
  result: PlinkoResult;
}

// Board geometry (SVG units). The viewBox scales to fit the canvas width.
const W = 340;
const PAD = 20;
const CENTER = W / 2;
const TOP = 24;
const ROW_GAP = 22;
const BUCKET_H = 24;

export default function Plinko() {
  const { profile } = useAuth();
  const { play, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState<PlinkoRisk>("medium");
  // Multiple balls can be in flight at once (Stake-style rapid drops).
  const [balls, setBalls] = useState<Ball[]>([]);
  // Buckets that should flash because a ball just landed in them.
  const [flashes, setFlashes] = useState<{ id: number; bucket: number }[]>([]);
  const [lastResult, setLastResult] = useState<PlinkoResult | null>(null);
  const seq = useRef(0);

  const multipliers = useMemo(() => plinkoMultipliers(risk, rows), [risk, rows]);
  const g = (W - 2 * PAD) / rows;
  const boardH = TOP + rows * ROW_GAP + 6 + BUCKET_H + 8;
  const bucketY = TOP + rows * ROW_GAP + 6;
  const bucketW = g - 2;
  const inFlight = balls.length > 0;

  // The board reshapes when rows/risk change, so the rows/risk controls are
  // locked while balls are falling — meaning this only fires between rounds.
  useEffect(() => {
    setBalls([]);
    setFlashes([]);
    setLastResult(null);
  }, [rows, risk]);

  // Pegs: a triangle of dots, rows r = 1..rows with r+1 pegs each.
  const pegs = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let r = 1; r <= rows; r++) {
      for (let j = 0; j <= r; j++) {
        out.push({ x: CENTER + (j - r / 2) * g, y: TOP + r * ROW_GAP });
      }
    }
    return out;
  }, [rows, g]);

  // Waypoints for one ball, derived from the server-returned left/right path.
  function waypoints(result: PlinkoResult) {
    const pts: { x: number; y: number }[] = [{ x: CENTER, y: TOP - 8 }];
    let r = 0;
    for (let s = 1; s <= result.rows; s++) {
      if (result.path[s - 1] === 1) r += 1;
      pts.push({ x: CENTER + (r - s / 2) * g, y: TOP + s * ROW_GAP });
    }
    pts.push({ x: CENTER + (result.bucket - result.rows / 2) * g, y: bucketY + BUCKET_H / 2 });
    return { xs: pts.map((p) => p.x), ys: pts.map((p) => p.y) };
  }

  async function dropBall() {
    if (!profile) return;
    try {
      const r = await play<PlinkoResult>(
        "casino_plinko",
        { p_bet: amount, p_rows: rows, p_risk: risk },
        { allowConcurrent: true }
      );
      const id = (seq.current += 1);
      setBalls((b) => [...b, { id, result: { ...r, path: r.path.map(Number) } }]);
    } catch {
      /* error surfaced by hook */
    }
  }

  function onSettled(ball: Ball) {
    setBalls((b) => b.filter((x) => x.id !== ball.id));
    setLastResult(ball.result);
    const fid = (seq.current += 1);
    setFlashes((f) => [...f, { id: fid, bucket: ball.result.bucket }]);
    window.setTimeout(() => setFlashes((f) => f.filter((x) => x.id !== fid)), 450);
    if (ball.result.win) celebrate(ball.result.multiplier >= 10);
  }

  return (
    <GameShell
      game="plinko"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Risk</label>
            <div className="flex gap-2">
              {PLINKO_RISKS.map((rk) => (
                <button
                  key={rk}
                  onClick={() => setRisk(rk)}
                  disabled={inFlight}
                  className={clsx("btn flex-1 capitalize", risk === rk ? "btn-primary" : "btn-ghost")}
                >
                  {rk}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-ink-faint">
              <span className="font-semibold uppercase tracking-wide">Rows</span>
              <span className="font-semibold text-ink">{rows}</span>
            </div>
            <input
              type="range"
              min={PLINKO_MIN_ROWS}
              max={PLINKO_MAX_ROWS}
              step={1}
              value={rows}
              disabled={inFlight}
              onChange={(e) => setRows(parseInt(e.target.value))}
            />
            {inFlight && (
              <span className="text-[11px] text-ink-faint">Rows &amp; risk lock while balls are dropping.</span>
            )}
          </div>

          <button onClick={dropBall} disabled={!profile} className="btn btn-primary py-3 text-base">
            Drop {formatMoney(amount)}
            {inFlight && <span className="ml-1 opacity-70">· {balls.length} in play</span>}
          </button>

          {lastResult && (
            <div
              className={clsx(
                "rounded-xl border px-3 py-2 text-center text-sm font-semibold",
                lastResult.win
                  ? "border-yes/30 bg-yes/10 text-yes-text"
                  : "border-no/30 bg-no/10 text-no-text"
              )}
            >
              {lastResult.multiplier.toFixed(lastResult.multiplier >= 100 ? 0 : 2)}× —{" "}
              {lastResult.win
                ? `Won ${formatMoney(lastResult.payout)}`
                : `Lost ${formatMoney(amount - lastResult.payout)}`}
            </div>
          )}
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="flex h-full items-center justify-center">
        <svg viewBox={`0 0 ${W} ${boardH}`} className="h-auto w-full max-w-[460px]" style={{ maxHeight: 460 }}>
          {/* pegs */}
          {pegs.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={2.4} fill="rgba(255,255,255,0.45)" />
          ))}

          {/* buckets */}
          {multipliers.map((m, k) => {
            const cx = CENTER + (k - rows / 2) * g;
            const isHit = flashes.some((f) => f.bucket === k);
            const color = bucketColor(k, rows);
            return (
              <g key={k}>
                <rect
                  x={cx - bucketW / 2}
                  y={bucketY}
                  width={bucketW}
                  height={BUCKET_H}
                  rx={4}
                  fill={color}
                  stroke={isHit ? "#ffffff" : "transparent"}
                  strokeWidth={isHit ? 2 : 0}
                  style={{ filter: isHit ? "brightness(1.45)" : "none", transition: "filter 0.2s" }}
                />
                <text
                  x={cx}
                  y={bucketY + BUCKET_H / 2 + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.min(8, g * 0.36)}
                  fontWeight={800}
                  fill="#0b0b12"
                  className="pointer-events-none tabular-nums"
                >
                  {m >= 100 ? Math.round(m) : m}
                </text>
              </g>
            );
          })}

          {/* balls in flight */}
          {balls.map((ball) => {
            const { xs, ys } = waypoints(ball.result);
            return (
              <motion.circle
                key={ball.id}
                r={4.6}
                fill="#fde047"
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={0.6}
                initial={{ cx: xs[0], cy: ys[0] }}
                animate={{ cx: xs, cy: ys }}
                transition={{ duration: Math.max(0.9, ball.result.rows * 0.08), ease: "easeIn" }}
                onAnimationComplete={() => onSettled(ball)}
              />
            );
          })}
        </svg>
      </div>
    </GameShell>
  );
}
