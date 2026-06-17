"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { formatMoney } from "@/lib/format";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import clsx from "clsx";

interface LimboResult {
  win: boolean;
  result: number;
  target: number;
  payout: number;
}

export default function Limbo() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(2);
  const [result, setResult] = useState<LimboResult | null>(null);
  const [display, setDisplay] = useState(1);
  const nodeRef = useRef<HTMLDivElement>(null);

  const payoutPreview = amount * target;

  useEffect(() => {
    if (!result) return;
    const controls = animate(1, result.result, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [result]);

  async function go() {
    try {
      const r = await play<LimboResult>("casino_limbo", { p_bet: amount, p_target: target });
      setResult(r);
    } catch {
      /* surfaced by hook */
    }
  }

  return (
    <GameShell
      game="limbo"
      title="Limbo"
      emoji="📈"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={busy} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Target multiplier
            </label>
            <div className="relative">
              <input
                type="number"
                min={1.01}
                step="0.01"
                value={target}
                disabled={busy}
                onChange={(e) => setTarget(Math.max(1.01, parseFloat(e.target.value) || 1.01))}
                className="input pr-8 font-semibold tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">×</span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-soft/50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">Win chance</div>
            <div className="text-sm font-bold tabular-nums">{(99 / target).toFixed(2)}%</div>
          </div>
          <button onClick={go} disabled={busy || !profile} className="btn btn-primary py-3 text-base">
            {busy ? "…" : `Bet ${formatMoney(amount)} → ${formatMoney(payoutPreview)}`}
          </button>
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div
          ref={nodeRef}
          className={clsx(
            "text-7xl font-black tabular-nums sm:text-8xl",
            !result ? "text-ink-faint" : result.win ? "text-yes-text" : "text-no-text"
          )}
        >
          {(result ? display : 1).toFixed(2)}×
        </div>
        {result ? (
          <div className={clsx("text-base font-semibold", result.win ? "text-yes-text" : "text-no-text")}>
            {result.win
              ? `You hit ${target.toFixed(2)}× — won ${formatMoney(result.payout)} 🎉`
              : `Needed ${target.toFixed(2)}× — busted`}
          </div>
        ) : (
          <div className="text-sm text-ink-faint">Set a target and pull the lever</div>
        )}
      </div>
    </GameShell>
  );
}
