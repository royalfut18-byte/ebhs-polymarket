"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import {
  MAX_SHOT_SPEED,
  POCKETS,
  TABLE,
  isValidCuePlacement,
  simulate,
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
  7: "#7c1f2b",
};
const MIN_POWER = 0.12;

function ballColor(i: number): string {
  if (i === 0) return "#f6f5ef";
  if (i === 8) return "#171717";
  return SOLID_COLORS[i <= 7 ? i : i - 8];
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

interface AnimState {
  frames: PoolBallState[][];
  start: number;
  done: () => void;
}
interface OpponentAim {
  angle: number;
  power: number;
  cue: { x: number; y: number };
  t: number;
}

export default function PoolTable({
  state,
  mySeat,
  meId,
  matchId,
  canPlay,
  onShoot,
}: {
  state: PoolState;
  mySeat: number;
  meId: string;
  matchId: string;
  canPlay: boolean;
  onShoot: (after: PoolState, winnerSeat: number | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, force] = useReducer((x) => x + 1, 0);

  const dispRef = useRef<PoolBallState[]>(state.balls);
  const aimRef = useRef<number>(0); // default: aim toward the rack (to the right)
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const animRef = useRef<AnimState | null>(null);
  const handledShot = useRef<string | null>(state.lastShot?.at ?? null);
  const scaleRef = useRef(1);
  const oppAimRef = useRef<OpponentAim | null>(null);
  const chargeRef = useRef(0); // live power while charging (for the cue pull-back)
  // Aim is set by DRAGGING on the table and stays locked on release — no
  // hover-follow, so moving to the power bar never disturbs your aim.
  const aimingRef = useRef(false);
  const downPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const movedRef = useRef(false);

  const [cueOverride, setCueOverride] = useState<{ x: number; y: number } | null>(null);
  const cueOverrideRef = useRef(cueOverride);
  cueOverrideRef.current = cueOverride;

  const stateRef = useRef(state);
  stateRef.current = state;
  const canPlayRef = useRef(canPlay);
  canPlayRef.current = canPlay;

  const animating = () => animRef.current != null;
  const ballInHand = state.ballInHand && canPlay;

  // Clear a stale ball-in-hand placement whenever it no longer applies.
  useEffect(() => {
    if (!ballInHand) setCueOverride(null);
  }, [ballInHand]);

  // ---- realtime channel: live aim + instant shots (no DB round-trip wait) ----
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabase>["channel"]> | null>(null);
  useEffect(() => {
    const supabase = getSupabase();
    const ch = supabase.channel(`pool-rt-${matchId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "aim" }, ({ payload }) => {
      if (payload.by === meId) return;
      oppAimRef.current = { angle: payload.angle, power: payload.power, cue: payload.cue, t: performance.now() };
    });
    ch.on("broadcast", { event: "shot" }, ({ payload }) => {
      if (payload.by === meId) return;
      if (handledShot.current === payload.at) return;
      handledShot.current = payload.at;
      oppAimRef.current = null;
      const { frames } = simulate(payload.pre, payload.vx, payload.vy);
      // Settle to the authoritative layout (by then the DB state has landed),
      // so a scratched cue resets to its ball-in-hand spot rather than vanishing.
      animRef.current = { frames, start: performance.now(), done: () => (dispRef.current = stateRef.current.balls) };
      force();
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [matchId, meId]);

  const lastAimSent = useRef(0);
  function broadcastAim() {
    const ch = channelRef.current;
    if (!ch) return;
    const now = performance.now();
    if (now - lastAimSent.current < 45) return;
    lastAimSent.current = now;
    const cue = cueOverrideRef.current ?? dispRef.current.find((b) => b.i === 0);
    if (!cue) return;
    ch.send({
      type: "broadcast",
      event: "aim",
      payload: { by: meId, angle: aimRef.current, power: chargeRef.current, cue: { x: cue.x, y: cue.y } },
    });
  }

  // ---- settle / replay on authoritative state change ----
  useEffect(() => {
    const ls = state.lastShot;
    if (!ls) {
      if (!animating()) dispRef.current = state.balls;
      handledShot.current = null;
      return;
    }
    if (ls.at === handledShot.current) {
      if (!animating()) dispRef.current = state.balls;
      return;
    }
    handledShot.current = ls.at;
    if (ls.by === meId) {
      dispRef.current = state.balls;
      return;
    }
    // opponent shot we haven't already animated via broadcast — replay + settle
    const settled = state.balls;
    const { frames } = simulate(ls.pre, ls.vx, ls.vy);
    animRef.current = { frames, start: performance.now(), done: () => (dispRef.current = settled) };
    oppAimRef.current = null;
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastShot?.at, state.balls, meId]);

  // ---- single render loop ----
  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => draw();
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const anim = animRef.current;
      if (anim) {
        const idx = Math.floor(((performance.now() - anim.start) / 1000) * 60);
        if (idx >= anim.frames.length - 1) {
          dispRef.current = anim.frames[anim.frames.length - 1];
          const done = anim.done;
          animRef.current = null;
          done();
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
  }, []);

  // ---- responsive sizing (retina-aware) ----
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = w / 2;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scaleRef.current = w / TABLE.W;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  function logicalFromClient(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const s = scaleRef.current;
    return { x: (clientX - rect.left) / s, y: (clientY - rect.top) / s };
  }
  function cuePos(): PoolBallState | undefined {
    return dispRef.current.find((b) => b.i === 0);
  }

  // Hover only updates the ball-in-hand placement ghost — never the aim.
  function onCanvasMove(e: React.PointerEvent) {
    if (!canPlay) return;
    mouseRef.current = logicalFromClient(e.clientX, e.clientY);
  }
  // Press to start an aim-drag (or, with ball-in-hand, a tap to place the cue).
  function onCanvasDown(e: React.PointerEvent) {
    if (animating() || !canPlay || state.pending || state.phase === "done") return;
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    aimingRef.current = true;
    movedRef.current = false;
    downPointRef.current = logicalFromClient(e.clientX, e.clientY);
  }

  // Drag-to-aim handled on window so it keeps working off the canvas; the aim
  // freezes (locks) the instant you release.
  const broadcastAimRef = useRef<() => void>(() => {});
  broadcastAimRef.current = broadcastAim;
  useEffect(() => {
    function move(e: PointerEvent) {
      if (!aimingRef.current) return;
      const p = logicalFromClient(e.clientX, e.clientY);
      const d = Math.hypot(p.x - downPointRef.current.x, p.y - downPointRef.current.y);
      if (d > 1.2) movedRef.current = true; // ~half a ball: distinguishes drag from tap
      if (movedRef.current) {
        const cue = cueOverrideRef.current ?? cuePos();
        if (cue) {
          aimRef.current = Math.atan2(p.y - cue.y, p.x - cue.x);
          broadcastAimRef.current();
        }
      }
    }
    function up() {
      if (!aimingRef.current) return;
      aimingRef.current = false;
      // A tap (no drag) while ball-in-hand places the cue ball.
      if (!movedRef.current && stateRef.current.ballInHand && canPlayRef.current) {
        const p = downPointRef.current;
        if (isValidCuePlacement(p.x, p.y, dispRef.current)) {
          setCueOverride({ x: p.x, y: p.y });
          broadcastAimRef.current();
        }
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  function shoot(power: number) {
    if (animating() || !canPlayRef.current) return;
    const st = stateRef.current;
    if (st.pending || st.phase === "done") return;
    const angle = aimRef.current;
    const speed = MAX_SHOT_SPEED * Math.max(MIN_POWER, Math.min(1, power));
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const pre = dispRef.current.map((b) =>
      b.i === 0 && cueOverrideRef.current ? { ...b, x: cueOverrideRef.current.x, y: cueOverrideRef.current.y, in: false } : { ...b }
    );
    const { frames, final, events } = simulate(pre, vx, vy);
    const { state: after, winnerSeat } = resolveShot({ ...st, balls: pre }, final, events, mySeat, { by: meId, pre, vx, vy });
    handledShot.current = after.lastShot!.at;
    // broadcast the shot so the opponent animates instantly
    channelRef.current?.send({
      type: "broadcast",
      event: "shot",
      payload: { by: meId, at: after.lastShot!.at, pre, vx, vy },
    });
    setCueOverride(null);
    oppAimRef.current = null;
    animRef.current = { frames, start: performance.now(), done: () => onShoot(after, winnerSeat) };
    force();
  }

  // aim projection → first ball hit (ghost) or rail
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
    const st = stateRef.current;

    // felt with a soft vignette
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, W * 0.75);
    grad.addColorStop(0, "#1aa163");
    grad.addColorStop(0.7, "#138a52");
    grad.addColorStop(1, "#0e6b40");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // rail shadow (inner bevel)
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = R * 0.7;
    ctx.strokeRect(0, 0, W, H);

    // diamond sights
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    const sights = [0.25, 0.5, 0.75];
    for (const f of sights) {
      diamond(ctx, f * W, R * 0.55, R * 0.28);
      diamond(ctx, f * W, H - R * 0.55, R * 0.28);
    }
    for (const f of [1 / 3, 2 / 3]) {
      diamond(ctx, R * 0.55, f * H, R * 0.28);
      diamond(ctx, W - R * 0.55, f * H, R * 0.28);
    }

    // head string
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50 * s, R * 0.4);
    ctx.lineTo(50 * s, H - R * 0.4);
    ctx.stroke();

    // pockets
    for (const p of POCKETS) {
      const pr = TABLE.POCKET * s;
      const pg = ctx.createRadialGradient(p.x * s, p.y * s, pr * 0.2, p.x * s, p.y * s, pr);
      pg.addColorStop(0, "#000");
      pg.addColorStop(1, "#0b0b0b");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, pr * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const idle = !animating() && canPlayRef.current && !st.pending && st.phase !== "done";

    // opponent's live aim (when it's their turn)
    const oa = oppAimRef.current;
    if (oa && !idle && performance.now() - oa.t < 1600 && !animating()) {
      drawAimOverlay(ctx, s, oa.cue.x, oa.cue.y, oa.angle, oa.power, "rgba(56,189,248,0.85)");
    }

    // my aim
    const cue = cueOverrideRef.current ?? cuePos();
    if (idle && cue) {
      const { gx, gy, obj } = aimProjection(cue.x, cue.y, aimRef.current);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(cue.x * s, cue.y * s);
      ctx.lineTo(gx * s, gy * s);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(gx * s, gy * s, R, 0, Math.PI * 2);
      ctx.stroke();
      if (obj) {
        const odx = obj.x - gx;
        const ody = obj.y - gy;
        const ol = Math.hypot(odx, ody) || 1;
        ctx.beginPath();
        ctx.moveTo(obj.x * s, obj.y * s);
        ctx.lineTo((obj.x + (odx / ol) * 16) * s, (obj.y + (ody / ol) * 16) * s);
        ctx.stroke();
      }
      drawCueStick(ctx, s, cue.x, cue.y, aimRef.current, chargeRef.current);
    }

    // balls
    for (const b of dispRef.current) {
      if (b.in) continue;
      const useOverride = b.i === 0 && cueOverrideRef.current && st.ballInHand && canPlayRef.current;
      const x = (useOverride ? cueOverrideRef.current!.x : b.x) * s;
      const y = (useOverride ? cueOverrideRef.current!.y : b.y) * s;
      drawBall(ctx, b.i, x, y, R);
    }

    // ball-in-hand placement ghost
    if (idle && ballInHand && mouseRef.current && !cueOverrideRef.current) {
      const m = mouseRef.current;
      const ok = isValidCuePlacement(m.x, m.y, dispRef.current);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ok ? "#f6f5ef" : "#d63a2f";
      ctx.beginPath();
      ctx.arc(m.x * s, m.y * s, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawAimOverlay(ctx: CanvasRenderingContext2D, s: number, cx: number, cy: number, angle: number, power: number, color: string) {
    const { gx, gy } = aimProjection(cx, cy, angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx * s, cy * s);
    ctx.lineTo(gx * s, gy * s);
    ctx.stroke();
    ctx.setLineDash([]);
    drawCueStick(ctx, s, cx, cy, angle, power, true);
  }

  function drawCueStick(ctx: CanvasRenderingContext2D, s: number, cx: number, cy: number, angle: number, power: number, faint = false) {
    const back = 7 + power * 30;
    const bx = cx - Math.cos(angle) * back;
    const by = cy - Math.sin(angle) * back;
    const tx = cx - Math.cos(angle) * (back + 78);
    const ty = cy - Math.sin(angle) * (back + 78);
    const g = ctx.createLinearGradient(bx * s, by * s, tx * s, ty * s);
    g.addColorStop(0, faint ? "rgba(160,200,230,0.6)" : "#e9d9b3");
    g.addColorStop(0.12, faint ? "rgba(120,170,210,0.5)" : "#b78b4a");
    g.addColorStop(1, faint ? "rgba(80,130,180,0.4)" : "#6f4f23");
    ctx.strokeStyle = g;
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx * s, by * s);
    ctx.lineTo(tx * s, ty * s);
    ctx.stroke();
    // tip
    if (!faint) {
      ctx.fillStyle = "#3b6bb0";
      ctx.beginPath();
      ctx.arc(bx * s, by * s, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBall(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, r: number) {
    const stripe = i >= 9;
    // contact shadow
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.16, y + r * 0.26, r * 1.02, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    if (stripe) {
      ctx.fillStyle = "#f5f1e6";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = ballColor(i);
      ctx.fillRect(x - r, y - r * 0.52, r * 2, r * 1.04);
      ctx.restore();
    } else {
      ctx.fillStyle = ballColor(i);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // shading + specular
    const sh = ctx.createRadialGradient(x - r * 0.32, y - r * 0.36, r * 0.1, x, y, r * 1.05);
    sh.addColorStop(0, "rgba(255,255,255,0.5)");
    sh.addColorStop(0.35, "rgba(255,255,255,0.04)");
    sh.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.16, 0, Math.PI * 2);
    ctx.fill();

    if (i !== 0) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#141414";
      ctx.font = `${Math.max(6, r * 0.62)}px ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i), x, y + 0.5);
    }
  }

  const showControls = canPlay && !animating() && !state.pending && state.phase !== "done";

  return (
    <div className="flex gap-3">
      <PowerMeter
        active={showControls}
        onCharge={(p) => (chargeRef.current = p)}
        onRelease={(p) => {
          chargeRef.current = 0;
          if (p >= MIN_POWER) shoot(p);
        }}
        onAimSync={broadcastAim}
      />
      <div className="flex flex-1 flex-col gap-2">
        <div
          ref={wrapRef}
          className="relative overflow-hidden rounded-[18px] border-[7px] border-[#3a2415] shadow-[0_10px_40px_-12px_rgba(0,0,0,0.7)]"
          style={{ background: "linear-gradient(#4a2f1a,#2c1b0e)" }}
        >
          <canvas
            ref={canvasRef}
            onPointerMove={onCanvasMove}
            onPointerDown={onCanvasDown}
            className={clsx("block w-full touch-none", showControls ? "cursor-crosshair" : "cursor-default")}
          />
          {animating() && (
            <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs text-white">
              <Loader2 size={12} className="animate-spin" /> rolling…
            </div>
          )}
        </div>
        {showControls && (
          <p className="text-center text-[11px] text-ink-faint">
            {ballInHand ? "Tap an open spot to place the cue ball · " : ""}
            Drag on the table to aim (it locks when you let go) · then drag the power bar and release to shoot.
          </p>
        )}
      </div>
    </div>
  );
}

// Vertical, springy drag-and-release power meter.
function PowerMeter({
  active,
  onCharge,
  onRelease,
  onAimSync,
}: {
  active: boolean;
  onCharge: (p: number) => void;
  onRelease: (p: number) => void;
  onAimSync: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [power, setPower] = useState(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  function powerFromY(clientY: number): number {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (r.bottom - clientY) / r.height));
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!draggingRef.current) return;
      const p = powerFromY(e.clientY);
      setPower(p);
      onCharge(p);
      onAimSync();
    }
    function up(e: PointerEvent) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      const p = powerFromY(e.clientY);
      onRelease(p);
      setPower(0); // springs back
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [onCharge, onRelease, onAimSync]);

  const pct = Math.round(power * 100);
  return (
    <div className="flex w-12 flex-col items-center gap-1 sm:w-14">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Power</span>
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          if (!active) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          draggingRef.current = true;
          setDragging(true);
          const p = powerFromY(e.clientY);
          setPower(p);
          onCharge(p);
        }}
        className={clsx(
          "relative flex-1 w-9 overflow-hidden rounded-full border border-border bg-bg-soft/70 sm:w-10",
          active ? "cursor-grab active:cursor-grabbing" : "opacity-40"
        )}
        style={{ touchAction: "none", minHeight: 180 }}
      >
        <div
          className="absolute inset-x-0 bottom-0 rounded-full"
          style={{
            height: `${power * 100}%`,
            background: "linear-gradient(to top,#22c55e,#eab308,#ef4444)",
            transition: dragging ? "none" : "height 420ms cubic-bezier(0.22,1.4,0.4,1)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-180 text-[10px] font-bold tabular-nums text-ink [writing-mode:vertical-rl]">
            {active ? `${pct}%` : ""}
          </span>
        </div>
      </div>
      <span className="text-center text-[9px] leading-tight text-ink-faint">drag &amp; release</span>
    </div>
  );
}
