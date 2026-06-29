"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import type { Card } from "@/lib/types";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import PlayingCard from "../PlayingCard";
import clsx from "clsx";

type Side = "player" | "banker" | "tie";
interface BaccaratResult {
  side: Side;
  winner: Side;
  player: Card[];
  banker: Card[];
  player_total: number;
  banker_total: number;
  multiplier: number;
  payout: number;
}

const SIDES: { key: Side; label: string; pays: string; tone: string }[] = [
  { key: "player", label: "Player", pays: "1 : 1", tone: "border-sky-400/40 bg-sky-500/10 text-sky-200" },
  { key: "tie", label: "Tie", pays: "8 : 1", tone: "border-yes/40 bg-yes/10 text-yes-text" },
  { key: "banker", label: "Banker", pays: "0.95 : 1", tone: "border-amber-400/40 bg-amber-500/10 text-amber-200" },
];

export default function Baccarat() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [side, setSide] = useState<Side>("player");
  const [result, setResult] = useState<BaccaratResult | null>(null);

  async function deal() {
    try {
      const r = await play<BaccaratResult>("casino_baccarat", { p_bet: amount, p_side: side });
      setResult(r);
      if (r.payout > amount) celebrate(r.side === "tie");
    } catch {
      /* surfaced by hook */
    }
  }

  return (
    <GameShell
      game="baccarat"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={busy} />
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Bet on</span>
            {SIDES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSide(s.key)}
                disabled={busy}
                className={clsx(
                  "flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
                  side === s.key ? s.tone + " ring-2 ring-white/20" : "border-border bg-white/[0.02] text-ink-dim hover:bg-white/[0.06]"
                )}
              >
                <span>{s.label}</span>
                <span className="text-xs opacity-80">{s.pays}</span>
              </button>
            ))}
          </div>
          <button onClick={deal} disabled={busy || !profile} className="btn btn-primary py-3 text-base">
            {busy ? "Dealing…" : `Bet ${formatMoney(amount)}`}
          </button>
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="flex h-full flex-col justify-center gap-6">
        <Hand label="Player" cards={result?.player} total={result?.player_total} highlight={result?.winner === "player"} />
        <Hand label="Banker" cards={result?.banker} total={result?.banker_total} highlight={result?.winner === "banker"} />

        <div className="text-center">
          {result ? (
            (() => {
              // multiplier: 0 = lose, 1 = push (tie when on player/banker), >1 = win
              const win = result.multiplier > 1;
              const push = result.multiplier === 1;
              return (
                <div
                  className={clsx(
                    "inline-block rounded-xl px-4 py-2 text-sm font-semibold",
                    win ? "bg-yes/15 text-yes-text" : push ? "bg-white/[0.06] text-ink-dim" : "bg-no/15 text-no-text"
                  )}
                >
                  {result.winner === "tie" ? "Tie" : `${result.winner === "player" ? "Player" : "Banker"} wins`} ·{" "}
                  {win ? `+${formatMoney(result.payout)}` : push ? "push — stake returned" : "you lose"}
                </div>
              );
            })()
          ) : (
            <p className="text-sm text-ink-faint">Pick a side and deal</p>
          )}
        </div>
      </div>
    </GameShell>
  );
}

function Hand({
  label,
  cards,
  total,
  highlight,
}: {
  label: string;
  cards?: Card[];
  total?: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className={clsx("w-16 text-sm font-bold", highlight ? "text-yes-text" : "text-ink-dim")}>
        {label}
        {total !== undefined && <span className="ml-1 tabular-nums">({total})</span>}
      </div>
      <div className="flex gap-2">
        {cards && cards.length > 0 ? (
          cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
        ) : (
          <>
            <PlayingCard faceDown size="sm" />
            <PlayingCard faceDown size="sm" />
          </>
        )}
      </div>
    </div>
  );
}
