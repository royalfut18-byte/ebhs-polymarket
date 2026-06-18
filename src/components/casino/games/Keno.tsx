"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import clsx from "clsx";

interface KenoResult {
  picks: number[];
  draw: number[];
  hits: number;
  multiplier: number;
  payout: number;
}

const NUMBERS = Array.from({ length: 40 }, (_, i) => i + 1);

export default function Keno() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [picks, setPicks] = useState<number[]>([]);
  const [result, setResult] = useState<KenoResult | null>(null);

  function toggle(n: number) {
    if (busy) return;
    setResult(null);
    setPicks((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : prev.length >= 10 ? prev : [...prev, n]
    );
  }

  function autoPick() {
    if (busy) return;
    setResult(null);
    const pool = [...NUMBERS].sort(() => Math.random() - 0.5).slice(0, 10);
    setPicks(pool);
  }

  async function go() {
    if (picks.length < 1) return;
    try {
      const r = await play<KenoResult>("casino_keno", { p_bet: amount, p_picks: picks });
      setResult(r);
      if (r.payout > 0) celebrate(r.multiplier >= 10);
    } catch {
      /* surfaced by hook */
    }
  }

  const drawn = new Set(result?.draw ?? []);

  return (
    <GameShell
      game="keno"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={busy} />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Selected" value={`${picks.length}/10`} />
            <Stat label="Hits" value={result ? `${result.hits}` : "—"} />
          </div>
          <div className="flex gap-2">
            <button onClick={autoPick} disabled={busy} className="btn btn-ghost flex-1">
              Auto-pick
            </button>
            <button
              onClick={() => {
                setPicks([]);
                setResult(null);
              }}
              disabled={busy}
              className="btn btn-ghost flex-1"
            >
              Clear
            </button>
          </div>
          <button onClick={go} disabled={busy || !profile || picks.length < 1} className="btn btn-primary py-3 text-base">
            {busy ? "Drawing…" : `Bet ${formatMoney(amount)}`}
          </button>
          {/* Reserved height — invisible when no result */}
          <div
            className={clsx(
              "rounded-xl px-3 py-2 text-center text-sm font-semibold",
              !result && "invisible",
              result && result.payout > 0 && "bg-yes/15 text-yes-text",
              result && result.payout === 0 && "bg-no/15 text-no-text"
            )}
          >
            {result
              ? result.payout > 0
                ? `${result.hits} hits · ${result.multiplier.toFixed(2)}× · ${formatMoney(result.payout)}`
                : `${result.hits} hits — no win`
              : " "}
          </div>
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="grid grid-cols-8 gap-1.5">
        {NUMBERS.map((n) => {
          const picked = picks.includes(n);
          const isDrawn = drawn.has(n);
          const hit = picked && isDrawn;
          return (
            <motion.button
              key={n}
              onClick={() => toggle(n)}
              whileTap={{ scale: 0.9 }}
              className={clsx(
                "aspect-square rounded-lg text-sm font-bold tabular-nums transition-colors",
                hit
                  ? "bg-yes text-black shadow-glow-yes"
                  : picked
                  ? "bg-brand text-white"
                  : isDrawn
                  ? "bg-no/30 text-no-text"
                  : "border border-border bg-bg-soft/50 text-ink-dim hover:bg-white/[0.07]"
              )}
            >
              {n}
            </motion.button>
          );
        })}
      </div>
    </GameShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-soft/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}
