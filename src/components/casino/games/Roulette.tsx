"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import RouletteWheel from "../RouletteWheel";
import clsx from "clsx";

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const NUMBERS = Array.from({ length: 37 }, (_, i) => i); // 0..36

type Bet = { type: string; value: number; amount: number };
interface RouletteResult {
  spin: number;
  total: number;
  payout: number;
  bets: { type: string; value: number; amount: number; won: boolean }[];
}

function colorOf(n: number) {
  if (n === 0) return "bg-yes/70 text-black";
  return RED.has(n) ? "bg-red-600 text-white" : "bg-zinc-800 text-white";
}

export default function Roulette() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [chips, setChips] = useState<Record<string, Bet>>({});
  const [result, setResult] = useState<RouletteResult | null>(null);
  const [nonce, setNonce] = useState(0);

  const total = useMemo(() => Object.values(chips).reduce((s, b) => s + b.amount, 0), [chips]);

  function placeBet(type: string, value: number) {
    if (busy || amount <= 0) return;
    setResult(null);
    const key = `${type}:${value}`;
    setChips((prev) => ({
      ...prev,
      [key]: { type, value, amount: (prev[key]?.amount ?? 0) + amount },
    }));
  }

  async function spin() {
    const bets = Object.values(chips);
    if (bets.length === 0) return;
    try {
      const r = await play<RouletteResult>("casino_roulette", { p_bets: bets });
      setResult(r);
      setNonce((n) => n + 1);
      if (r.payout > 0) setTimeout(() => celebrate(r.payout >= r.total * 5), 4200);
    } catch {
      /* surfaced by hook */
    }
  }

  const OutsideBtn = ({ type, value, label, className }: { type: string; value: number; label: string; className?: string }) => {
    const key = `${type}:${value}`;
    const placed = chips[key]?.amount ?? 0;
    return (
      <button
        onClick={() => placeBet(type, value)}
        disabled={busy}
        className={clsx(
          "relative rounded-lg border border-border px-2 py-2 text-xs font-bold transition-colors hover:bg-white/[0.07] disabled:opacity-50",
          className
        )}
      >
        {label}
        {placed > 0 && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-yellow-400 px-1.5 text-[10px] font-bold text-black">
            {placed}
          </span>
        )}
      </button>
    );
  };

  return (
    <GameShell
      game="roulette"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={busy} label="Chip size" />
          <div className="rounded-xl border border-border bg-bg-soft/50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">Total staked</div>
            <div className="text-lg font-bold tabular-nums">{formatMoney(total)}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <OutsideBtn type="red" value={0} label="Red" className="bg-red-600/30 text-red-200" />
            <OutsideBtn type="black" value={0} label="Black" className="bg-zinc-700/40 text-zinc-200" />
            <OutsideBtn type="even" value={0} label="Even" />
            <OutsideBtn type="odd" value={0} label="Odd" />
            <OutsideBtn type="low" value={0} label="1–18" />
            <OutsideBtn type="high" value={0} label="19–36" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <OutsideBtn type="dozen" value={1} label="1st 12" />
            <OutsideBtn type="dozen" value={2} label="2nd 12" />
            <OutsideBtn type="dozen" value={3} label="3rd 12" />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setChips({});
                setResult(null);
              }}
              disabled={busy}
              className="btn btn-ghost flex-1"
            >
              Clear
            </button>
            <button onClick={spin} disabled={busy || total === 0} className="btn btn-primary flex-1 py-3">
              {busy ? "Spinning…" : "Spin"}
            </button>
          </div>
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="flex h-full flex-col gap-5">
        <div className="flex flex-col items-center justify-center gap-3 py-2">
          <RouletteWheel result={result?.spin ?? null} nonce={nonce} />
          {result && (
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-lg font-black",
                  colorOf(result.spin)
                )}
              >
                {result.spin}
              </span>
              <span className={clsx("text-sm font-semibold", result.payout > 0 ? "text-yes-text" : "text-no-text")}>
                {result.payout > 0 ? `Won ${formatMoney(result.payout)}` : "No win this spin"}
              </span>
            </div>
          )}
        </div>

        {/* Straight-up number grid */}
        <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
          <button
            onClick={() => placeBet("number", 0)}
            disabled={busy}
            className={clsx(
              "row-span-3 rounded-md text-sm font-bold",
              colorOf(0),
              result?.spin === 0 && "ring-2 ring-white"
            )}
          >
            0
          </button>
          {NUMBERS.slice(1).map((n) => {
            const placed = chips[`number:${n}`]?.amount ?? 0;
            return (
              <button
                key={n}
                onClick={() => placeBet("number", n)}
                disabled={busy}
                className={clsx(
                  "relative rounded-md py-1.5 text-xs font-bold transition-transform hover:scale-105",
                  colorOf(n),
                  result?.spin === n && "ring-2 ring-white"
                )}
              >
                {n}
                {placed > 0 && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-yellow-400" />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-center text-[11px] text-ink-faint">
          Straight 35:1 · dozens 2:1 · red/black/even/odd/half 1:1
        </p>
      </div>
    </GameShell>
  );
}
