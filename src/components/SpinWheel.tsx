"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, PartyPopper } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import clsx from "clsx";

interface Segment {
  label: string;
  value: number;
  color: string;
}

const SEGMENTS: Segment[] = [
  { label: "$1000", value: 1000, color: "#fbbf24" },
  { label: "$50", value: 50, color: "#5b7cfa" },
  { label: "$500", value: 500, color: "#a855f7" },
  { label: "$50", value: 50, color: "#22d3ee" },
  { label: "$500", value: 500, color: "#a855f7" },
  { label: "$50", value: 50, color: "#5b7cfa" },
];
const N = SEGMENTS.length;
const SLICE = 360 / N;

const SYDNEY_TZ = "Australia/Sydney";

// Returns "YYYY-MM-DD" in Sydney local time.
function sydneyDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: SYDNEY_TZ });
}

// Returns the UTC ms timestamp of the next midnight in Sydney time.
function nextMidnightSydney(): number {
  const now = new Date();
  const today = sydneyDateStr(now);
  // Bisect between now and now+27h to find the exact UTC instant when Sydney
  // date flips from today to tomorrow (handles AEST/AEDT DST automatically).
  let lo = now.getTime();
  let hi = lo + 27 * 3600 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (sydneyDateStr(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}

function alreadySpunToday(lastSpinAt: string): boolean {
  return sydneyDateStr(new Date(lastSpinAt)) === sydneyDateStr(new Date());
}

function slicePath(i: number, r = 92, cx = 100, cy = 100) {
  const a0 = ((i * SLICE - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * SLICE - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 0,1 ${x1},${y1} Z`;
}

function labelPos(i: number, r = 60, cx = 100, cy = 100) {
  const a = (((i + 0.5) * SLICE - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export default function SpinWheel() {
  const { profile, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const queryClient = useQueryClient();

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCooldown = useMemo(
    () => !!profile?.last_spin_at && alreadySpunToday(profile.last_spin_at),
    [profile?.last_spin_at]
  );

  async function spin() {
    if (spinning || onCooldown || !profile) return;
    setSpinning(true);
    setError(null);
    setResult(null);

    const { data, error } = await supabase.rpc("spin_wheel");
    if (error) {
      setSpinning(false);
      setError(error.message);
      return;
    }

    const prize = Number((data as { prize: number }).prize);
    // Land on a segment that matches the prize.
    const matches = SEGMENTS.map((s, i) => (s.value === prize ? i : -1)).filter((i) => i >= 0);
    const target = matches[Math.floor(Math.random() * matches.length)] ?? 0;
    // Bring the chosen slice's centre under the top pointer, plus 5 full spins.
    const final = 360 * 5 - (target * SLICE + SLICE / 2);
    setRotation(final);

    // Reveal the result after the wheel settles.
    window.setTimeout(async () => {
      setSpinning(false);
      setResult(prize);
      if (prize > 0) {
        const confetti = (await import("canvas-confetti")).default;
        const colors = ["#fbbf24", "#a855f7", "#5b7cfa", "#22d3ee", "#22c55e"];
        confetti({ particleCount: 150, spread: 75, startVelocity: 45, origin: { y: 0.7 }, colors });
        window.setTimeout(
          () => confetti({ particleCount: 90, spread: 110, scalar: 0.9, origin: { y: 0.6 }, colors }),
          250
        );
      }
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-positions", profile.id] });
    }, 4200);
  }

  return (
    <div className="card relative flex flex-col items-center gap-4 overflow-hidden p-6">
      <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-accent-violet/15 blur-3xl" />
      <div className="relative flex items-center gap-2 self-start">
        <Gift size={18} className="text-accent-violet" />
        <h2 className="text-lg font-bold">Daily spin</h2>
      </div>
      <p className="relative -mt-2 self-start text-sm text-ink-dim">
        Spin once a day to win free credits — $1,000, $500, or $50. Every spin wins!
      </p>

      <div className="relative h-[230px] w-[230px]">
        {/* pointer */}
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
          <div className="h-0 w-0 border-x-[10px] border-t-[16px] border-x-transparent border-t-white drop-shadow" />
        </div>
        <motion.svg
          viewBox="0 0 200 200"
          className="h-full w-full drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          animate={{ rotate: rotation }}
          transition={{ duration: 4, ease: [0.16, 1, 0.3, 1] }}
        >
          <circle cx="100" cy="100" r="96" fill="#0e0e16" stroke="rgba(255,255,255,0.12)" />
          {SEGMENTS.map((s, i) => {
            const { x, y } = labelPos(i);
            return (
              <g key={i}>
                <path d={slicePath(i)} fill={s.color} stroke="#08080d" strokeWidth={1.5} />
                <text
                  x={x}
                  y={y}
                  fill={s.value === 0 ? "#9d9dac" : "#0b0b12"}
                  fontSize="13"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${i * SLICE + SLICE / 2}, ${x}, ${y})`}
                >
                  {s.label}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="14" fill="#13131d" stroke="rgba(255,255,255,0.18)" />
        </motion.svg>
      </div>

      {error && (
        <div className="relative rounded-xl border border-no/30 bg-no/10 px-3 py-2 text-sm text-no-text">
          {error}
        </div>
      )}

      {result !== null && !spinning && (
        <div
          className={clsx(
            "relative flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold",
            result > 0
              ? "border-yes/30 bg-yes/10 text-yes-text"
              : "border-border bg-bg-soft text-ink-dim"
          )}
        >
          <PartyPopper size={16} />
          {result > 0 ? `You won ${formatMoney(result)}! 🎉` : "No luck this time — try again tomorrow."}
        </div>
      )}

      {onCooldown ? (
        <div className="relative text-center text-sm text-ink-faint">
          Next spin available in <Countdown to={nextMidnightSydney()} />
        </div>
      ) : (
        <button
          onClick={spin}
          disabled={spinning}
          className="btn btn-primary relative w-full max-w-[230px] py-3 text-base"
        >
          {spinning ? <Loader2 size={18} className="animate-spin" /> : "Spin the wheel"}
        </button>
      )}
    </div>
  );
}

function Countdown({ to }: { to: number }) {
  const ms = Math.max(0, to - Date.now());
  const hours = Math.floor(ms / (3600 * 1000));
  const mins = Math.floor((ms % (3600 * 1000)) / 60000);
  return (
    <span className="font-semibold text-ink">
      {hours}h {mins}m
    </span>
  );
}
