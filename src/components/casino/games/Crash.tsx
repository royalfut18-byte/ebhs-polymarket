"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Rocket } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { CRASH_K } from "@/lib/casino/games";
import { celebrate } from "@/lib/casino/celebrate";
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
      if (r.status === "cashed") celebrate(r.multiplier >= 5);
    } catch {
      /* surfaced */
    } finally {
      roundRef.current = null;
    }
  }

  return (
    <GameShell
      game="crash"
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

          {/* Reserved height — invisible when no result */}
          <div
            className={clsx(
              "rounded-xl px-3 py-2 text-center text-sm font-semibold",
              !ended && "invisible",
              ended?.win && "bg-yes/15 text-yes-text",
              ended && !ended.win && "bg-no/15 text-no-text"
            )}
          >
            {ended?.win
              ? `Cashed @ ${ended.multiplier.toFixed(2)}× · +${formatMoney(ended.payout)} 🎉`
              : ended
              ? `Busted @ ${ended.crash.toFixed(2)}×`
              : " "}
          </div>
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <motion.div
        animate={ended && !ended.win ? { x: [0, -8, 7, -5, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="relative flex h-full min-h-[320px] flex-col items-center justify-center overflow-hidden"
      >
        <CrashChart m={display} state={ended ? (ended.win ? "cashed" : "lost") : running ? "running" : "idle"} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div
            className={clsx(
              "text-7xl font-black tabular-nums drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)] sm:text-8xl",
              ended && !ended.win ? "text-no-text" : running ? "text-white" : "text-ink-faint"
            )}
          >
            {display.toFixed(2)}×
          </div>
          {ended && !ended.win && (
            <div className="mt-1 text-sm font-bold uppercase tracking-widest text-no-text">Busted</div>
          )}
          {!running && !ended && (
            <p className="mt-2 text-sm text-ink-faint">Place a bet and ride the rocket</p>
          )}
        </div>
      </motion.div>
    </GameShell>
  );
}

// Self-scaling exponential curve that always frames the current multiplier,
// with a glowing comet tip + rocket. Mirrors the server growth m = e^(k·t).
function CrashChart({ m, state }: { m: number; state: "idle" | "running" | "cashed" | "lost" }) {
  const W = 100;
  const H = 60;
  const N = 36;
  const stroke = state === "lost" ? "#fb7185" : state === "cashed" ? "#34d399" : "#fbbf24";

  let d = `M0,${H}`;
  let tipX = 0;
  let tipY = H;
  if (m > 1.0001) {
    const tNow = Math.log(m) / CRASH_K;
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * tNow;
      const mi = Math.exp(CRASH_K * t);
      const x = (i / N) * W;
      const y = H - ((mi - 1) / (m - 1)) * H;
      d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
      tipX = x;
      tipY = y;
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" y1={H * g} x2={W} y2={H * g} stroke="rgba(255,255,255,0.05)" strokeWidth="0.3" />
      ))}
      {m > 1.0001 && (
        <>
          <path d={`${d} L${tipX},${H} L0,${H} Z`} fill="url(#crashFill)" />
          <path d={d} fill="none" stroke={stroke} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={tipX} cy={tipY} r="2.2" fill={stroke}>
            {state === "running" && <animate attributeName="r" values="2;3;2" dur="0.9s" repeatCount="indefinite" />}
          </circle>
          <g transform={`translate(${tipX - 4}, ${tipY - 8})`}>
            <Rocket
              width={7}
              height={7}
              color="#fff"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
            />
          </g>
        </>
      )}
    </svg>
  );
}
