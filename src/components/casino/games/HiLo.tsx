"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import type { Card } from "@/lib/types";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import PlayingCard from "../PlayingCard";
import clsx from "clsx";

export default function HiLo() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [mult, setMult] = useState(1);
  const [ended, setEnded] = useState<null | { win: boolean; payout: number }>(null);

  const active = !!roundId && !ended;
  const rank = card?.r ?? 0;
  const hiChance = ((14 - rank) * 4) / 52;
  const loChance = (rank * 4) / 52;
  const hiMult = hiChance > 0 ? 0.99 / hiChance : 0;
  const loMult = loChance > 0 ? 0.99 / loChance : 0;

  async function start() {
    try {
      const r = await play<{ round_id: string; card: Card }>("casino_hilo_start", { p_bet: amount });
      setRoundId(r.round_id);
      setCard(r.card);
      setMult(1);
      setEnded(null);
    } catch {
      /* surfaced */
    }
  }

  async function guess(dir: "hi" | "lo") {
    if (!active) return;
    try {
      const r = await play<{ status: "safe" | "lost"; card: Card; multiplier?: number }>("casino_hilo_guess", {
        p_round: roundId,
        p_dir: dir,
      });
      setCard(r.card);
      if (r.status === "lost") setEnded({ win: false, payout: 0 });
      else setMult(r.multiplier ?? mult);
    } catch {
      /* surfaced */
    }
  }

  async function cashout() {
    if (!active || mult <= 1) return;
    try {
      const r = await play<{ payout: number }>("casino_hilo_cashout", { p_round: roundId });
      setEnded({ win: true, payout: r.payout });
      celebrate(mult >= 4);
    } catch {
      /* surfaced */
    }
  }

  return (
    <GameShell
      game="hilo"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={active || busy} />
          {active && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Multiplier" value={`${mult.toFixed(2)}×`} />
              <Stat label="Cash value" value={formatMoney(amount * mult)} />
            </div>
          )}
          {active ? (
            <button
              onClick={cashout}
              disabled={busy || mult <= 1}
              className="btn py-3 text-base font-bold"
              style={{ background: "linear-gradient(90deg,#22c55e,#16a34a)", color: "#04120a" }}
            >
              Cash out {formatMoney(amount * mult)}
            </button>
          ) : (
            <button onClick={start} disabled={busy || !profile} className="btn btn-primary py-3 text-base">
              {busy ? "…" : `Bet ${formatMoney(amount)}`}
            </button>
          )}
          {ended && (
            <div
              className={clsx(
                "rounded-xl px-3 py-2 text-center text-sm font-semibold",
                ended.win ? "bg-yes/15 text-yes-text" : "bg-no/15 text-no-text"
              )}
            >
              {ended.win ? `Cashed out ${formatMoney(ended.payout)} 🎉` : "Wrong guess — you lose"}
            </div>
          )}
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-6">
        {card ? <PlayingCard card={card} size="lg" /> : <PlayingCard faceDown size="lg" />}

        {active ? (
          <div className="flex w-full max-w-xs flex-col gap-2.5">
            <button
              onClick={() => guess("hi")}
              disabled={busy}
              className="flex items-center justify-between rounded-xl border border-yes/30 bg-yes/10 px-4 py-3 text-sm font-semibold text-yes-text transition-colors hover:bg-yes/20 disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <ChevronUp size={18} /> Higher or same
              </span>
              <span className="tabular-nums">{hiMult.toFixed(2)}×</span>
            </button>
            <button
              onClick={() => guess("lo")}
              disabled={busy}
              className="flex items-center justify-between rounded-xl border border-no/30 bg-no/10 px-4 py-3 text-sm font-semibold text-no-text transition-colors hover:bg-no/20 disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <ChevronDown size={18} /> Lower or same
              </span>
              <span className="tabular-nums">{loMult.toFixed(2)}×</span>
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">Place a bet to draw the first card</p>
        )}
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
