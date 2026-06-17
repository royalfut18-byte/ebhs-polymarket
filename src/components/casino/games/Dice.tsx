"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { formatMoney } from "@/lib/format";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import clsx from "clsx";

interface DiceResult {
  win: boolean;
  roll: number;
  target: number;
  over: boolean;
  multiplier: number;
  payout: number;
}

export default function Dice() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [over, setOver] = useState(true);
  const [result, setResult] = useState<DiceResult | null>(null);

  const chance = over ? 100 - target : target;
  const multiplier = 99 / Math.max(chance, 0.01);

  async function roll() {
    try {
      const r = await play<DiceResult>("casino_dice", {
        p_bet: amount,
        p_target: target,
        p_over: over,
      });
      setResult(r);
    } catch {
      /* error surfaced by hook */
    }
  }

  const markerPct = result ? result.roll : 50;

  return (
    <GameShell
      game="dice"
      title="Dice"
      emoji="🎲"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={busy} />

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Multiplier" value={`${multiplier.toFixed(2)}×`} />
            <Stat label="Win chance" value={`${chance.toFixed(2)}%`} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setOver(false)}
              disabled={busy}
              className={clsx("btn flex-1", over ? "btn-ghost" : "btn-primary")}
            >
              Roll Under
            </button>
            <button
              onClick={() => setOver(true)}
              disabled={busy}
              className={clsx("btn flex-1", over ? "btn-primary" : "btn-ghost")}
            >
              Roll Over
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-ink-faint">
              <span>Target</span>
              <span className="font-semibold text-ink">{target.toFixed(0)}</span>
            </div>
            <input
              type="range"
              min={2}
              max={98}
              step={1}
              value={target}
              disabled={busy}
              onChange={(e) => setTarget(parseInt(e.target.value))}
            />
          </div>

          <button onClick={roll} disabled={busy || !profile} className="btn btn-primary py-3 text-base">
            {busy ? "Rolling…" : `Bet ${formatMoney(amount)}`}
          </button>
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="flex h-full flex-col justify-center gap-8">
        <div className="text-center">
          <motion.div
            key={result ? `${result.roll}-${Math.random()}` : "idle"}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={clsx(
              "text-6xl font-black tabular-nums sm:text-7xl",
              !result ? "text-ink-faint" : result.win ? "text-yes-text" : "text-no-text"
            )}
          >
            {result ? result.roll.toFixed(2) : "00.00"}
          </motion.div>
          {result && (
            <div className={clsx("mt-1 text-sm font-semibold", result.win ? "text-yes-text" : "text-no-text")}>
              {result.win ? `Won ${formatMoney(result.payout)} (${result.multiplier.toFixed(2)}×)` : "No luck — try again"}
            </div>
          )}
        </div>

        {/* Track */}
        <div className="relative mx-2">
          <div className="flex h-3 overflow-hidden rounded-full">
            <div className={clsx("h-full", over ? "bg-no/40" : "bg-yes/50")} style={{ width: `${target}%` }} />
            <div className={clsx("h-full flex-1", over ? "bg-yes/50" : "bg-no/40")} />
          </div>
          {/* target line */}
          <div
            className="absolute -top-1.5 h-6 w-0.5 -translate-x-1/2 rounded bg-white/70"
            style={{ left: `${target}%` }}
          />
          {/* roll marker */}
          <motion.div
            className="absolute -top-3 -translate-x-1/2"
            animate={{ left: `${markerPct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 14 }}
          >
            <div
              className={clsx(
                "h-0 w-0 border-x-[7px] border-t-[11px] border-x-transparent",
                result ? (result.win ? "border-t-yes-text" : "border-t-no-text") : "border-t-white"
              )}
            />
          </motion.div>
          <div className="mt-2 flex justify-between text-[10px] text-ink-faint">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>
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
