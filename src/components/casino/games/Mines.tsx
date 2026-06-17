"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bomb, Gem } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import clsx from "clsx";

const TILES = Array.from({ length: 25 }, (_, i) => i);

export default function Mines() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [mineCount, setMineCount] = useState(3);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [safe, setSafe] = useState<Set<number>>(new Set());
  const [mines, setMines] = useState<Set<number>>(new Set());
  const [hit, setHit] = useState<number | null>(null);
  const [mult, setMult] = useState(1);
  const [nextMult, setNextMult] = useState(1);
  const [ended, setEnded] = useState<null | { win: boolean; payout: number }>(null);

  const active = !!roundId && !ended;

  async function start() {
    try {
      const r = await play<{ round_id: string }>("casino_mines_start", { p_bet: amount, p_mines: mineCount });
      setRoundId(r.round_id);
      setSafe(new Set());
      setMines(new Set());
      setHit(null);
      setMult(1);
      setNextMult(1);
      setEnded(null);
    } catch {
      /* surfaced */
    }
  }

  async function reveal(tile: number) {
    if (!active || safe.has(tile)) return;
    try {
      const r = await play<{
        status: "safe" | "cashed" | "lost";
        tile?: number;
        hit?: number;
        multiplier?: number;
        next_multiplier?: number;
        payout?: number;
        mines?: number[];
      }>("casino_mines_reveal", { p_round: roundId, p_tile: tile });

      if (r.status === "lost") {
        setHit(r.hit ?? tile);
        setMines(new Set(r.mines ?? []));
        setEnded({ win: false, payout: 0 });
      } else if (r.status === "cashed") {
        setSafe((p) => new Set(p).add(tile));
        setMines(new Set(r.mines ?? []));
        setMult(r.multiplier ?? mult);
        setEnded({ win: true, payout: r.payout ?? 0 });
        celebrate(true);
      } else {
        setSafe((p) => new Set(p).add(tile));
        setMult(r.multiplier ?? mult);
        setNextMult(r.next_multiplier ?? mult);
      }
    } catch {
      /* surfaced */
    }
  }

  async function cashout() {
    if (!active || safe.size === 0) return;
    try {
      const r = await play<{ multiplier: number; payout: number; mines: number[] }>("casino_mines_cashout", {
        p_round: roundId,
      });
      setMines(new Set(r.mines));
      setMult(r.multiplier);
      setEnded({ win: true, payout: r.payout });
      celebrate(r.multiplier >= 3);
    } catch {
      /* surfaced */
    }
  }

  return (
    <GameShell
      game="mines"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={active || busy} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Mines</label>
            <select
              value={mineCount}
              disabled={active || busy}
              onChange={(e) => setMineCount(parseInt(e.target.value))}
              className="input"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {active && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Current" value={`${mult.toFixed(2)}×`} />
              <Stat label="Next tile" value={`${nextMult.toFixed(2)}×`} />
            </div>
          )}

          {active ? (
            <button
              onClick={cashout}
              disabled={busy || safe.size === 0}
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
              {ended.win ? `Cashed out ${formatMoney(ended.payout)} 🎉` : "💥 Boom! You hit a mine"}
            </div>
          )}
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="mx-auto grid max-w-[360px] grid-cols-5 gap-2">
        {TILES.map((t) => {
          const isSafe = safe.has(t);
          const isMine = mines.has(t);
          const isHit = hit === t;
          const revealed = isSafe || (ended && isMine);
          return (
            <motion.button
              key={t}
              onClick={() => reveal(t)}
              disabled={!active || isSafe || busy}
              whileHover={active && !isSafe ? { scale: 1.06, y: -2 } : {}}
              whileTap={active && !isSafe ? { scale: 0.92 } : {}}
              className={clsx(
                "flex aspect-square items-center justify-center rounded-xl transition-colors",
                !revealed &&
                  "border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:from-white/[0.12]",
                isSafe && "bg-yes/20 ring-1 ring-yes/40",
                ended && isMine && (isHit ? "bg-no/30 ring-2 ring-no" : "bg-no/15"),
                !active && !ended && "opacity-60"
              )}
            >
              {revealed && (
                <motion.span
                  initial={{ rotateY: 90, scale: 0.5, opacity: 0 }}
                  animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                >
                  {isSafe ? (
                    <Gem className="text-yes-text drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]" size={26} />
                  ) : isMine ? (
                    <Bomb className={clsx(isHit ? "text-no-text" : "text-no-text/70")} size={26} />
                  ) : null}
                </motion.span>
              )}
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
