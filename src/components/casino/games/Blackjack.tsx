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

type Status = "active" | "won" | "lost" | "push" | "blackjack";
interface BjState {
  status: Status;
  done: boolean;
  round_id?: string;
  player: Card[];
  dealer: Card[];
  player_total: number;
  dealer_total?: number;
  can_double?: boolean;
  payout?: number;
}

const MESSAGES: Record<Status, string> = {
  blackjack: "Blackjack! 🎉",
  won: "You win 🎉",
  push: "Push — bet returned",
  lost: "Dealer wins",
  active: "",
};

export default function Blackjack() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [state, setState] = useState<BjState | null>(null);

  const active = state?.status === "active" && !state.done;

  function maybeCelebrate(r: BjState) {
    if (r.done && (r.status === "won" || r.status === "blackjack")) celebrate(r.status === "blackjack");
  }

  async function deal() {
    try {
      const r = await play<BjState>("casino_bj_start", { p_bet: amount });
      setState(r);
      maybeCelebrate(r);
    } catch {
      /* surfaced */
    }
  }

  async function action(a: "hit" | "stand" | "double") {
    if (!active || !state?.round_id) return;
    try {
      const r = await play<BjState>("casino_bj_action", { p_round: state.round_id, p_action: a });
      setState(r);
      maybeCelebrate(r);
    } catch {
      /* surfaced */
    }
  }

  return (
    <GameShell
      game="blackjack"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={active || busy} />

          {/* Action buttons — always rendered, invisible when not active to prevent layout shift */}
          <div className={clsx("flex flex-col gap-2", !active && "invisible")}>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => action("hit")} disabled={busy || !active} className="btn btn-ghost py-3">
                Hit
              </button>
              <button onClick={() => action("stand")} disabled={busy || !active} className="btn btn-ghost py-3">
                Stand
              </button>
            </div>
            <button
              onClick={() => action("double")}
              disabled={busy || !active || !state?.can_double || (profile?.balance ?? 0) < amount}
              className="btn btn-primary py-3"
            >
              Double
            </button>
          </div>
          <button
            onClick={deal}
            disabled={busy || !profile || active}
            className={clsx("btn btn-primary py-3 text-base", active && "invisible")}
          >
            {busy && !active ? "Dealing…" : `Deal ${formatMoney(amount)}`}
          </button>

          {state?.done && (
            <div
              className={clsx(
                "rounded-xl px-3 py-2 text-center text-sm font-semibold",
                (state.payout ?? 0) > amount
                  ? "bg-yes/15 text-yes-text"
                  : state.status === "push"
                  ? "bg-white/[0.06] text-ink-dim"
                  : "bg-no/15 text-no-text"
              )}
            >
              {MESSAGES[state.status]}
              {(state.payout ?? 0) > 0 && state.status !== "push" && ` · +${formatMoney(state.payout ?? 0)}`}
            </div>
          )}
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="flex h-full flex-col justify-center gap-8">
        <Row
          label="Dealer"
          cards={state?.dealer ?? []}
          total={state?.done ? state?.dealer_total : undefined}
          hideSecond={!!active}
          empty={!state}
        />
        <Row label="You" cards={state?.player ?? []} total={state?.player_total} empty={!state} />
      </div>
    </GameShell>
  );
}

function Row({
  label,
  cards,
  total,
  hideSecond,
  empty,
}: {
  label: string;
  cards: Card[];
  total?: number;
  hideSecond?: boolean;
  empty?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-bold text-ink-dim">
        {label}
        {total !== undefined && (
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs tabular-nums text-ink">{total}</span>
        )}
      </div>
      <div className="flex gap-2">
        {empty ? (
          <>
            <PlayingCard faceDown size="md" />
            <PlayingCard faceDown size="md" />
          </>
        ) : (
          <>
            {cards.map((c, i) => (
              <PlayingCard key={i} card={c} size="md" />
            ))}
            {hideSecond && <PlayingCard faceDown size="md" />}
          </>
        )}
      </div>
    </div>
  );
}
