"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  MAX_SHOT_SPEED,
  POCKETS,
  TABLE,
  isValidCuePlacement,
  simulate,
  type ShotEvents,
} from "@/lib/arena/pool/physics";
import { resolveShot } from "@/lib/arena/pool/rules";
import type { PoolBallState, PoolState } from "@/lib/arena/types";
import clsx from "clsx";

const SOLID_COLORS: Record<number, string> = {
  1: "#f4c333",
  2: "#2f6bd6",
  3: "#d63a2f",
  4: "#7a3da8",
  5: "#e07b27",
  6: "#2f9e57",
  7: "#8a2f2f",
};

function ballColor(i: number): string {
  if (i === 0) return "#f7f7f5";
  if (i === 8) return "#181818";
  return SOLID_COLORS[i <= 7 ? i : i - 8];
}

interface AnimState {
  frames: PoolBallState[][];
  start: number;
  done: () => void;
}

export default function PoolTable({
  state,
  mySeat,
  meId,
  canPlay,
  onShoot,
}: {
  state: PoolState;
  mySeat: number;
  meId: string;
  canPlay: boolean; // it's my turn and the game is live
  onShoot: (after: PoolState, winnerSeat: number | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [power, setPower] = useState(0.65);
  const [, force] = useReducer((x) => x + 1, 0);

  const dispRef = useRef<PoolBallState[]>(state.balls);
  const aimRef = useRef<number>(Math.PI); // radians; default aim toward the rack
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const animRef = useRef<AnimState | null>(null);
  const handledShot = useRef<string | null>(state.lastShot?.at ?? null);
  const scaleRef = useRef(1);
  const powerRef = useRef(power);
  powerRef.current = power;

  const [cueOverride, setCueOverride] = useState<{ x: number; y: number } | null>(null);
  const cueOverrideRef = useRef(cueOverride);
  cueOverrideRef.current = cueOverride;

  const animating = () => animRef.current != null;
  const ballInHand = state.ballInHand && canPlay;

  // The render loop is set up once, so it must call the LATEST draw closure
  // (which captures current state/turn) via a ref — not the stale first one.
  // `draw` is a hoisted function declaration; refresh the ref every render.
  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => draw();

  // Settle / replay when the authoritative state changes.
  useEffect(() => {
    const ls = state.lastShot;
    if (!ls) {
      dispRef.current = state.balls;
      handledShot.current = null;
      return;
    }
    if (ls.at === handledShot.current) {
      // already handled (initial mount, or my own shot I animated locally)
      if (!animating()) dispRef.current = state.balls;
      return;
    }
    handledShot.current = ls.at;
    if (ls.by === meId) {
      dispRef.current = state.balls;
      return;
    }
    // opponent's shot — replay it from the exact pre-shot layout, then settle.
    const settled = state.balls;
    const { frames } = simulate(ls.pre, ls.vx, ls.vy);
    animRef.current = { frames, start: performance.now(), done: () => (dispRef.current = settled) };
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastShot?.at, state.balls, meId]);

  // Keep the resting layout in sync while idle (e.g. ball-in-hand resets).
  useEffect(() => {
    if (!animating() && (!state.lastShot || state.lastShot.at === handledShot.current)) {
      dispRef.current = state.balls;
    }
  }, [state.balls, state.lastShot]);

  // Single render loop: draws the scene every frame and advances any animation.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const anim = animRef.current;
      if (anim) {
        const idx = Math.floor(((performance.now() - anim.start) / 1000) * 60);
        if (idx >= anim.frames.length - 1) {
          dispRef.current = anim.frames[anim.frames.length - 1];
          anim.done();
          animRef.current = null;
          force();
        } else {
          dispRef.current = anim.frames[idx];
        }
      }
      drawRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Responsive sizing.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = w / 2;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scaleRef.current = w / TABLE.W;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  function toLogical(e: React.PointerEvent | React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const s = scaleRef.current;
    return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s };
  }

  function cuePos(): PoolBallState | undefined {
    return dispRef.current.find((b) => b.i === 0);
  }

  function onMove(e: React.PointerEvent) {
    if (animating() || !canPlay) return;
    const p = toLogical(e);
    mouseRef.current = p;
    const cue = cueOverrideRef.current ?? cuePos();
    if (cue) aimRef.current = Math.atan2(p.y - cue.y, p.x - cue.x);
  }

  function onDown(e: React.PointerEvent) {
    if (animating() || !canPlay || state.pending || state.phase === "done") return;
    const p = toLogical(e);
    if (ballInHand) {
      if (isValidCuePlacement(p.x, p.y, dispRef.current)) setCueOverride({ x: p.x, y: p.y });
      return;
    }
    shoot();
  }

  function shoot() {
    if (animating() || !canPlay || state.pending || state.phase === "done") return;
    const angle = aimRef.current;
    const speed = MAX_SHOT_SPEED * powerRef.current;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const pre = dispRef.current.map((b) =>
      b.i === 0 && cueOverrideRef.current ? { ...b, x: cueOverrideRef.current.x, y: cueOverrideRef.current.y, in: false } : { ...b }
    );
    const { frames, final, events } = simulate(pre, vx, vy);
    const { state: after, winnerSeat } = resolveShot({ ...state, balls: pre }, final, events, mySeat, {
      by: meId,
      pre,
      vx,
      vy,
    });
    handledShot.current = after.lastShot!.at;
    setCueOverride(null);
    animRef.current = { frames, start: performance.now(), done: () => onShoot(after, winnerSeat) };
    force();
  }

  // Project the aim line to the first ball (or rail) for an aiming aid.
  function aimProjection(cx: number, cy: number, angle: number) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = Infinity;
    let ghost: { x: number; y: number; obj: PoolBallState } | null = null;
    for (const b of dispRef.current) {
      if (b.i === 0 || b.in) continue;
      const ex = b.x - cx;
      const ey = b.y - cy;
      const proj = ex * dx + ey * dy;
      if (proj <= 0) continue;
      const perp2 = ex * ex + ey * ey - proj * proj;
      const rr = (2 * TABLE.R) * (2 * TABLE.R);
      if (perp2 > rr) continue;
      const t = proj - Math.sqrt(rr - perp2);
      if (t > 0 && t < best) {
        best = t;
        ghost = { x: cx + dx * t, y: cy + dy * t, obj: b };
      }
    }
    if (ghost) return { gx: ghost.x, gy: ghost.y, obj: ghost.obj };
    // otherwise extend to a rail
    const ts: number[] = [];
    if (dx > 0) ts.push((TABLE.W - TABLE.R - cx) / dx);
    else if (dx < 0) ts.push((TABLE.R - cx) / dx);
    if (dy > 0) ts.push((TABLE.H - TABLE.R - cy) / dy);
    else if (dy < 0) ts.push((TABLE.R - cy) / dy);
    const t = Math.min(...ts.filter((v) => v > 0));
    return { gx: cx + dx * t, gy: cy + dy * t, obj: null };
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = scaleRef.current;
    const W = TABLE.W * s;
    const H = TABLE.H * s;
    const R = TABLE.R * s;

    // felt
    const grad = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W);
    grad.addColorStop(0, "#1f9e63");
    grad.addColorStop(1, "#157a4b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // head string
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50 * s, 0);
    ctx.lineTo(50 * s, H);
    ctx.stroke();

    // pockets
    ctx.fillStyle = "#0a0a0a";
    for (const p of POCKETS) {
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, TABLE.POCKET * s * 0.95, 0, Math.PI * 2);
      ctx.fill();
    }

    const idle = !animating() && canPlay && !state.pending && state.phase !== "done";

    // aim aid
    const cue = cueOverrideRef.current ?? cuePos();
    if (idle && cue) {
      const { gx, gy, obj } = aimProjection(cue.x, cue.y, aimRef.current);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(cue.x * s, cue.y * s);
      ctx.lineTo(gx * s, gy * s);
      ctx.stroke();
      ctx.setLineDash([]);
      // ghost + object deflection
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(gx * s, gy * s, R, 0, Math.PI * 2);
      ctx.stroke();
      if (obj) {
        const odx = obj.x - gx;
        const ody = obj.y - gy;
        const ol = Math.hypot(odx, ody) || 1;
        ctx.beginPath();
        ctx.moveTo(obj.x * s, obj.y * s);
        ctx.lineTo((obj.x + (odx / ol) * 14) * s, (obj.y + (ody / ol) * 14) * s);
        ctx.stroke();
      }
      // cue stick behind the ball
      const back = 8 + powerRef.current * 26;
      const bx = cue.x - Math.cos(aimRef.current) * back;
      const by = cue.y - Math.sin(aimRef.current) * back;
      const tx = cue.x - Math.cos(aimRef.current) * (back + 70);
      const ty = cue.y - Math.sin(aimRef.current) * (back + 70);
      ctx.strokeStyle = "#caa46a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx * s, by * s);
      ctx.lineTo(tx * s, ty * s);
      ctx.stroke();
    }

    // balls
    for (const b of dispRef.current) {
      if (b.in) continue;
      const isCueOverride = b.i === 0 && cueOverrideRef.current;
      const x = (isCueOverride ? cueOverrideRef.current!.x : b.x) * s;
      const y = (isCueOverride ? cueOverrideRef.current!.y : b.y) * s;
      drawBall(ctx, b.i, x, y, R);
    }

    // ball-in-hand hint ghost following the mouse
    if (idle && ballInHand && mouseRef.current && !cueOverrideRef.current) {
      const m = mouseRef.current;
      const ok = isValidCuePlacement(m.x, m.y, dispRef.current);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ok ? "#f7f7f5" : "#d63a2f";
      ctx.beginPath();
      ctx.arc(m.x * s, m.y * s, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawBall(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, r: number) {
    const stripe = i >= 9;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.arc(x + r * 0.18, y + r * 0.22, r, 0, Math.PI * 2);
    ctx.fill();

    if (stripe) {
      ctx.fillStyle = "#f4f1ea";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = ballColor(i);
      ctx.fillRect(x - r, y - r * 0.5, r * 2, r);
      ctx.restore();
    } else {
      ctx.fillStyle = ballColor(i);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // gloss
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.4, "rgba(255,255,255,0.05)");
    g.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // number pip (skip cue)
    if (i !== 0) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = `${Math.max(6, r * 0.6)}px ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i), x, y + 0.5);
    }
  }

  const showShoot = canPlay && !animating() && !state.pending && state.phase !== "done";

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-2xl border-[6px] border-[#5a3a1f] bg-[#157a4b] shadow-card"
      >
        <canvas
          ref={canvasRef}
          onPointerMove={onMove}
          onPointerDown={onDown}
          className={clsx("block w-full touch-none", showShoot ? "cursor-crosshair" : "cursor-default")}
        />
        {animating() && (
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-xs text-white">
            <Loader2 size={12} className="animate-spin" /> rolling…
          </div>
        )}
      </div>

      {showShoot && (
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Power</span>
            <input
              type="range"
              min={0.12}
              max={1}
              step={0.01}
              value={power}
              onChange={(e) => setPower(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="w-9 text-right text-xs font-semibold tabular-nums text-ink">{Math.round(power * 100)}%</span>
          </div>
          <button onClick={shoot} className="btn btn-primary px-6">
            Shoot
          </button>
        </div>
      )}
      {ballInHand && showShoot && (
        <p className="text-center text-xs text-brand-light">
          Ball in hand — click an open spot to place the cue ball, then aim and shoot.
        </p>
      )}
    </div>
  );
}

// Re-export for callers that want to derive a result without the component.
export type { ShotEvents };
