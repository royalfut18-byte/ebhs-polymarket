"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCasino } from "@/lib/casino/useCasino";
import { useActiveRound } from "@/lib/casino/roundSignal";
import { celebrate } from "@/lib/casino/celebrate";
import { formatMoney } from "@/lib/format";
import GameShell from "../GameShell";
import BetAmount from "../BetAmount";
import clsx from "clsx";

// Multiplier after passing N pipes — mirrors _flappy_mult() on the server (the
// server is the source of truth for the payout; this is just for live display).
// Rake curve: starts at 0.5x and grows gently, so you're underwater until ~7
// pipes and only a real run turns a profit. Capped at 10x.
export const flappyMult = (pipes: number) => Math.min(Math.round(0.5 * Math.pow(1.12, Math.max(0, pipes)) * 100) / 100, 10);

type Phase = "idle" | "ready" | "playing" | "crashed" | "cashed";

// Fixed cloud layout (fractions of canvas height) — varied y/size so the sky
// looks natural. Evenly spaced horizontally by the draw loop.
const CLOUDS = [
  { y: 0.16, r: 0.055 },
  { y: 0.30, r: 0.04 },
  { y: 0.21, r: 0.05 },
  { y: 0.36, r: 0.045 },
];

interface Pipe {
  x: number;
  gapY: number; // centre of the gap (px)
  gapH: number;
  passed: boolean;
}
interface GameState {
  birdY: number;
  vy: number;
  rot: number;
  wing: number;
  pipes: Pipe[];
  spawnX: number;
  score: number;
  groundX: number;
  cloudX: number; // continuous cloud-parallax offset (own accumulator)
  shake: number;
  t: number; // last timestamp
}

export default function Flappy() {
  const { profile, refreshProfile } = useAuth();
  const { play, busy, error } = useCasino();

  const [amount, setAmount] = useState(10);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pipes, setPipes] = useState(0);
  const [result, setResult] = useState<{ kind: "crash" | "cash"; mult: number; payout: number; pipes: number; bet: number } | null>(null);
  useActiveRound(phase === "playing" || phase === "ready");

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef(0);
  const roundRef = useRef<string | null>(null);
  const settling = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const g = useRef<GameState>({
    birdY: 0, vy: 0, rot: 0, wing: 0, pipes: [], spawnX: 0, score: 0, groundX: 0, cloudX: 0, shake: 0, t: 0,
  });
  // The loop is set up once, so it must call the LATEST crash closure via a ref.
  const crashRef = useRef<(s: number) => void>(() => {});
  // Cached canvas gradients — rebuilt only when the size changes, never per
  // frame. Recreating gradients every frame churns the GC and causes stutter.
  const gfx = useRef<{
    h: number; pipeW: number; r: number;
    sky: CanvasGradient | null; pipe: CanvasGradient | null; bird: CanvasGradient | null;
  }>({ h: 0, pipeW: 0, r: 0, sky: null, pipe: null, bird: null });

  // ---- sizing (retina) ----
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
      if (phaseRef.current === "idle") g.current.birdY = h * 0.45;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ---- input ----
  function flap() {
    const { h } = sizeRef.current;
    if (phaseRef.current === "ready") {
      setPhase("playing");
      phaseRef.current = "playing";
    }
    if (phaseRef.current !== "playing") return;
    g.current.vy = -h * 0.62;
    g.current.wing = 1;
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- game loop ----
  useEffect(() => {
    const loop = (now: number) => {
      const st = g.current;
      const { w, h } = sizeRef.current;
      const dt = Math.min(0.032, st.t ? (now - st.t) / 1000 : 0.016);
      st.t = now;
      st.groundX = (st.groundX - w * 0.18 * dt) % 40;
      if (w > 0) st.cloudX = (st.cloudX + w * 0.035 * dt) % (w + 200);
      st.wing = Math.max(0, st.wing - dt * 4);
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 4);

      if (phaseRef.current === "playing" && w > 0) {
        const G = h * 2.4; // gravity
        st.vy += G * dt;
        st.birdY += st.vy * dt;
        st.rot = Math.max(-0.5, Math.min(1.4, st.vy / (h * 0.9)));

        // difficulty ramps with score
        const speed = w * (0.34 + Math.min(0.4, st.score * 0.012));
        const gapH = Math.max(h * 0.22, h * 0.34 - st.score * h * 0.006);
        const pipeW = w * 0.12;
        const spacing = w * 0.62;

        // spawn
        st.spawnX -= speed * dt;
        if (st.spawnX <= 0) {
          st.spawnX = spacing;
          const margin = h * 0.12;
          const gapY = margin + gapH / 2 + Math.random() * (h - 2 * margin - gapH);
          st.pipes.push({ x: w + pipeW, gapY, gapH, passed: false });
        }

        const birdX = w * 0.3;
        const R = Math.max(9, h * 0.035);
        for (const p of st.pipes) {
          p.x -= speed * dt;
          if (!p.passed && p.x + pipeW < birdX) {
            p.passed = true;
            st.score += 1;
            setPipes(st.score);
          }
          // collision
          if (birdX + R > p.x && birdX - R < p.x + pipeW) {
            if (st.birdY - R < p.gapY - p.gapH / 2 || st.birdY + R > p.gapY + p.gapH / 2) {
              crashRef.current(st.score);
            }
          }
        }
        // drop off-screen pipes in place (no per-frame array allocation)
        while (st.pipes.length > 0 && st.pipes[0].x + pipeW <= -10) st.pipes.shift();

        // ground / ceiling
        const groundY = h - h * 0.12;
        if (st.birdY + R >= groundY) {
          st.birdY = groundY - R;
          crashRef.current(st.score);
        }
        if (st.birdY - R < 0) {
          st.birdY = R;
          st.vy = 0;
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- money flow ----
  async function start() {
    if (busy || settling.current) return;
    try {
      const r = await play<{ round_id: string }>("casino_flappy_start", { p_bet: amount }, { defer: true });
      roundRef.current = r.round_id;
      settling.current = false;
      const { h } = sizeRef.current;
      g.current = { birdY: h * 0.45, vy: -h * 0.3, rot: 0, wing: 1, pipes: [], spawnX: h * 0.4, score: 0, groundX: 0, cloudX: g.current.cloudX, shake: 0, t: 0 };
      setPipes(0);
      setResult(null);
      setPhase("ready");
    } catch {
      /* surfaced by hook */
    }
  }
  async function cashout() {
    if (phaseRef.current !== "playing" && phaseRef.current !== "ready") return;
    const round = roundRef.current;
    if (!round || settling.current) return;
    settling.current = true;
    const p = g.current.score;
    setPhase("cashed");
    phaseRef.current = "cashed";
    try {
      const r = await play<{ pipes: number; multiplier: number; payout: number }>(
        "casino_flappy_cashout",
        { p_round: round, p_pipes: p },
        { defer: true }
      );
      refreshProfile();
      setResult({ kind: "cash", mult: r.multiplier, payout: r.payout, pipes: r.pipes, bet: amount });
      // Only celebrate a net win — a sub-1× cash-out pays out but is a loss.
      if (r.multiplier > 1) celebrate(r.multiplier >= 5);
    } catch {
      /* surfaced */
    } finally {
      roundRef.current = null;
      settling.current = false; // round is settled — let the player start a new one
    }
  }
  async function crash(score: number) {
    if (settling.current) return;
    settling.current = true;
    g.current.shake = 1;
    setPhase("crashed");
    phaseRef.current = "crashed";
    const round = roundRef.current;
    try {
      if (round) await play("casino_flappy_lose", { p_round: round, p_pipes: score }, { defer: true });
      refreshProfile();
      setResult({ kind: "crash", mult: 0, payout: 0, pipes: score, bet: amount });
    } catch {
      /* surfaced */
    } finally {
      roundRef.current = null;
      settling.current = false; // round is settled — let the player start a new one
    }
  }
  crashRef.current = crash;

  // ---- render ----
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    if (w === 0) return;
    const st = g.current;
    const pipeW = w * 0.12;
    const R = Math.max(9, h * 0.035);

    // (re)build the cached gradients only when the size actually changes
    const gx = gfx.current;
    if (gx.h !== h || gx.pipeW !== pipeW || gx.r !== R) {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#4ec0f0");
      sky.addColorStop(1, "#bde0ff");
      const pipe = ctx.createLinearGradient(0, 0, pipeW, 0);
      pipe.addColorStop(0, "#5bbd2e");
      pipe.addColorStop(0.5, "#8ed94f");
      pipe.addColorStop(1, "#4a9c25");
      const bird = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.2, 0, 0, R * 1.3);
      bird.addColorStop(0, "#ffe24a");
      bird.addColorStop(1, "#f5b400");
      gx.sky = sky; gx.pipe = pipe; gx.bird = bird;
      gx.h = h; gx.pipeW = pipeW; gx.r = R;
    }

    ctx.save();
    if (st.shake > 0) ctx.translate((Math.random() - 0.5) * st.shake * 10, (Math.random() - 0.5) * st.shake * 10);

    // sky
    ctx.fillStyle = gx.sky!;
    ctx.fillRect(0, 0, w, h);

    // parallax clouds — drift slowly and wrap seamlessly off-screen, using
    // their own continuous offset (never the ground's modulo-40 tile value).
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    const period = w + 200;
    for (let i = 0; i < CLOUDS.length; i++) {
      const c = CLOUDS[i];
      const base = (i * period) / CLOUDS.length;
      const cx = (((base - st.cloudX) % period) + period) % period - 100;
      cloud(ctx, cx, h * c.y, h * c.r);
    }

    const groundY = h - h * 0.12;

    // pipes (one cached gradient reused for every pipe via translate)
    for (const p of st.pipes) {
      ctx.save();
      ctx.translate(p.x, 0);
      drawPipe(ctx, pipeW, 0, p.gapY - p.gapH / 2, gx.pipe!);
      drawPipe(ctx, pipeW, p.gapY + p.gapH / 2, groundY, gx.pipe!);
      ctx.restore();
    }

    // ground
    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = "#5ec24a";
    ctx.fillRect(0, groundY, w, Math.max(4, h * 0.02));
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let x = st.groundX; x < w; x += 40) ctx.fillRect(x, groundY + h * 0.02, 20, h * 0.1);

    // bird
    drawBird(ctx, w * 0.3, st.birdY, st.rot, st.wing, R, phaseRef.current, gx.bird!);

    ctx.restore();
  }

  const mult = phase === "playing" || phase === "ready" ? flappyMult(pipes) : result?.mult ?? 1;
  const live = phase === "playing" || phase === "ready";
  const inProfit = mult >= 1; // below 1x you'd cash out for less than your bet

  return (
    <GameShell
      game="flappy"
      controls={
        <>
          <BetAmount amount={amount} setAmount={setAmount} balance={profile?.balance ?? 0} disabled={live || busy} max={100} />

          {live ? (
            <button
              onClick={cashout}
              className="btn py-3 text-base font-bold"
              style={
                inProfit
                  ? { background: "linear-gradient(90deg,#22c55e,#16a34a)", color: "#04120a" }
                  : { background: "linear-gradient(90deg,#b45309,#92400e)", color: "#fff7ed" }
              }
            >
              Cash out {mult.toFixed(2)}× · {formatMoney(amount * mult)}
            </button>
          ) : (
            <button onClick={start} disabled={busy || !profile} className="btn btn-primary py-3 text-base">
              {busy ? "…" : `Bet ${formatMoney(amount)}`}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-border bg-bg-soft/50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">Pipes</div>
              <div className="text-lg font-bold tabular-nums">{live ? pipes : result?.pipes ?? 0}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-soft/50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">Multiplier</div>
              <div className={clsx("text-lg font-bold tabular-nums", inProfit ? "text-lime-300" : "text-amber-400")}>
                {mult.toFixed(2)}×
              </div>
            </div>
          </div>

          {(() => {
            const netWin = !!result && result.kind === "cash" && result.payout > result.bet;
            const partial = !!result && result.kind === "cash" && !netWin; // cashed below 1× — a net loss
            return (
              <div
                className={clsx(
                  "rounded-xl px-3 py-2 text-center text-sm font-semibold",
                  !result && "invisible",
                  netWin && "bg-yes/15 text-yes-text",
                  partial && "bg-amber-500/15 text-amber-300",
                  result?.kind === "crash" && "bg-no/15 text-no-text"
                )}
              >
                {!result
                  ? " "
                  : result.kind === "crash"
                    ? `Crashed at ${result.pipes} pipe${result.pipes === 1 ? "" : "s"} — lost ${formatMoney(result.bet)}`
                    : netWin
                      ? `Cashed @ ${result.mult.toFixed(2)}× · +${formatMoney(result.payout)} 🎉`
                      : `Cashed @ ${result.mult.toFixed(2)}× · ${formatMoney(result.payout)} back, lost ${formatMoney(result.bet - result.payout)}`}
              </div>
            );
          })()}
          <p className="text-center text-[11px] text-ink-faint">
            Tap or press Space to flap. You&apos;re underwater until ~7 pipes — fly past them and
            cash out before you crash.
          </p>
          {error && <p className="text-center text-sm text-no-text">{error}</p>}
        </>
      }
    >
      <div
        ref={wrapRef}
        onPointerDown={(e) => {
          e.preventDefault();
          flap();
        }}
        className="relative h-[420px] w-full cursor-pointer touch-none overflow-hidden rounded-xl"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        {/* live multiplier overlay — amber while underwater, white once in profit */}
        {live && (
          <div
            className={clsx(
              "pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-5xl font-black drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]",
              inProfit ? "text-white" : "text-amber-300"
            )}
          >
            {mult.toFixed(2)}×
          </div>
        )}
        {phase === "ready" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/10">
            <div className="rounded-full bg-black/55 px-4 py-2 text-lg font-black text-white">Tap to start flapping!</div>
          </div>
        )}
        {phase === "idle" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white">
              Place a bet, then flap to fly 🐤
            </div>
          </div>
        )}
        {phase === "crashed" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl bg-no/80 px-5 py-3 text-2xl font-black text-white">CRASHED</div>
          </div>
        )}
      </div>
    </GameShell>
  );
}

// ---------- drawing helpers ----------
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r, y + r * 0.2, r * 0.8, 0, Math.PI * 2);
  ctx.arc(x - r, y + r * 0.2, r * 0.8, 0, Math.PI * 2);
  ctx.arc(x + r * 0.4, y - r * 0.4, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

// Drawn at local x=0 — the caller translates to the pipe's x so a single
// cached gradient can be reused for every pipe.
function drawPipe(ctx: CanvasRenderingContext2D, w: number, top: number, bottom: number, body: CanvasGradient) {
  if (bottom <= top) return;
  ctx.fillStyle = body;
  ctx.fillRect(0, top, w, bottom - top);
  ctx.strokeStyle = "#3c7a1d";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, top, w, bottom - top);
  // cap (at the gap end)
  const capH = Math.min(18, w * 0.5);
  const capW = w + 8;
  const capY = top === 0 ? bottom - capH : top;
  ctx.fillStyle = body;
  ctx.fillRect(-4, capY, capW, capH);
  ctx.strokeRect(-4, capY, capW, capH);
}

function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, wing: number, r: number, phase: Phase, body: CanvasGradient) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(phase === "crashed" ? 1.2 : rot);
  // body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c98a00";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // wing (flaps when wing>0)
  ctx.fillStyle = "#fff4c2";
  ctx.beginPath();
  const wy = wing > 0 ? -r * 0.5 : r * 0.2;
  ctx.ellipse(-r * 0.15, wy, r * 0.55, r * 0.35, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d8a800";
  ctx.stroke();
  // eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(r * 0.5, -r * 0.35, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(r * 0.6, -r * 0.35, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  // beak
  ctx.fillStyle = "#ff8a2a";
  ctx.beginPath();
  ctx.moveTo(r * 0.95, -r * 0.05);
  ctx.lineTo(r * 1.55, r * 0.1);
  ctx.lineTo(r * 0.95, r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
