"use client";

import { useEffect, useRef, useState } from "react";
import { Rocket } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { CRASH_K } from "@/lib/casino/games";
import { formatMoney } from "@/lib/format";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import clsx from "clsx";

interface Ended {
  win: boolean;
  multiplier: number;
  crash: number;
  payout: number;
}

export default function Crash() {
  const { profile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [autoTarget, setAutoTarget] = useState<number>(0); // 0 = no auto cashout
  const [display, setDisplay] = useState(1);
  const [running, setRunning] = useState(false);
  const [ended, setEnded] = useState<Ended | null>(null);

  const raf = useRef<number>();
  const startMs = useRef<number>(0);
  const cashingOut = useRef(false);
  // refs so the rAF loop + auto-cashout always see live values (not stale closures)
  const roundRef = useRef<string | null>(null);
  const displayRef = useRef(1);
  const autoRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current ?? 0), []);

  function loop() {
    const elapsed = (performance.now() - startMs.current) / 1000;
    const m = Math.exp(CRASH_K * elapsed);
    displayRef.current = m;
    setDisplay(m);
    if (autoRef.current >= 1.01 && m >= autoRef.current && !cashingOut.current) {
      cashout(autoRef.current);
      return;
    }
    raf.current = requestAnimationFrame(loop);
  }

  async function start() {
    autoRef.current = autoTarget;
    try {
      const r = await play<{ round_id: string; started_at: string }>("casino_crash_start", { p_bet: amount });
      roundRef.current = r.round_id;
      setEnded(null);
      setDisplay(1);
      displayRef.current = 1;
      cashingOut.current = false;
      // align local clock to the server's round start so display matches the server
      startMs.current = performance.now() - (Date.now() - Date.parse(r.started_at));
      setRunning(true);
      raf.current = requestAnimationFrame(loop);
    } catch {
      /* surfaced */
    }
  }

  async function cashout(at?: number) {
    const round = roundRef.current;
    if (!round || cashingOut.current) return;
    cashingOut.current = true;
    cancelAnimationFrame(raf.current ?? 0);
    const claimed = at ?? displayRef.current;
    setRunning(false);
    try {
      const r = await play<{ status: "cashed" | "lost"; multiplier: number; crash: number; payout: number }>(
        "casino_crash_cashout",
        { p_round: round, p_multiplier: claimed }
      );
      setDisplay(r.status === "cashed" ? r.multiplier : r.crash);
      setEnded({ win: r.status === "cashed", multiplier: r.multiplier, crash: r.crash, payout: r.payout });
    } catch {
      /* surfaced */
    } finally {
      roundRef.current = null;
    }
  }

  return (
    <GameShell
      game="crash"
      title="Crash"
      emoji="🚀"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={running || busy} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Auto cash out (optional)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.1"
                placeholder="e.g. 2.00"
                value={autoTarget || ""}
                disabled={running || busy}
                onChange={(e) => setAutoTarget(parseFloat(e.target.value) || 0)}
                className="input pr-8 font-semibold tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">×</span>
            </div>
          </div>

          {running ? (
            <button
              onClick={() => cashout()}
              disabled={busy && cashingOut.current}
              className="btn py-3 text-base font-bold"
              style={{ background: "linear-gradient(90deg,#22c55e,#16a34a)", color: "#04120a" }}
            >
              Cash out {formatMoney(amount * display)}
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
              {ended.win
                ? `Cashed @ ${ended.multiplier.toFixed(2)}× · +${formatMoney(ended.payout)} 🎉`
                : `Busted @ ${ended.crash.toFixed(2)}×`}
            </div>
          )}
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div className="relative flex h-full min-h-[300px] flex-col items-center justify-center overflow-hidden">
        <div
          className={clsx(
            "pointer-events-none absolute inset-0 transition-opacity duration-300",
            running ? "opacity-100" : "opacity-40"
          )}
          style={{
            background:
              "radial-gradient(40rem 30rem at 50% 120%, rgba(244,63,94,0.18), transparent 60%)",
          }}
        />
        <Rocket
          size={40}
          className={clsx(
            "relative mb-2 transition-colors",
            ended && !ended.win ? "text-no-text" : running ? "animate-bounce text-rose-300" : "text-ink-faint"
          )}
        />
        <div
          className={clsx(
            "relative text-7xl font-black tabular-nums sm:text-8xl",
            ended && !ended.win ? "text-no-text" : running ? "text-ink" : "text-ink-faint"
          )}
        >
          {display.toFixed(2)}×
        </div>
        {!running && !ended && (
          <p className="relative mt-2 text-sm text-ink-faint">Place a bet and ride the rocket 🚀</p>
        )}
      </div>
    </GameShell>
  );
}
