// Deterministic 2D billiards physics for the arena's 8-ball game. Runs entirely
// in the browser (a physics engine can't live in Postgres, just like chess.js).
// Both clients run THIS same code from the same inputs, so the shooter's result
// and the opponent's replay match. The server only guards turn ownership and is
// the sole payout authority (the "balanced" anti-cheat model).
//
// Logical table units: 200 x 100 (2:1). The renderer scales these to pixels.
import type { PoolBallState } from "@/lib/arena/types";

export const TABLE = {
  W: 200,
  H: 100,
  R: 2.4, // ball radius
  POCKET: 4.8, // capture radius
  CUE_START: { x: 50, y: 50 },
};

// Six pockets: four corners + two side middles.
export const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE.W / 2, y: 0 },
  { x: TABLE.W, y: 0 },
  { x: 0, y: TABLE.H },
  { x: TABLE.W / 2, y: TABLE.H },
  { x: TABLE.W, y: TABLE.H },
];

export const MAX_SHOT_SPEED = 260; // units/sec at full power

const FPS = 60;
const SUB = 4; // physics sub-steps per rendered frame (anti-tunneling)
const DT = 1 / (FPS * SUB);
const DAMP = Math.pow(0.985, 1 / SUB); // velocity damping per sub-step
const WALL_RESTITUTION = 0.92;
const STOP_SPEED = 1.2; // below this (units/sec) a ball is at rest
const MAX_FRAMES = FPS * 10; // hard cap (~10s)

interface Sim extends PoolBallState {
  vx: number;
  vy: number;
}

export interface ShotEvents {
  potted: number[]; // ball ids pocketed this shot (may include 0 = cue)
  firstHit: number | null; // first object ball the cue contacted
  cuePotted: boolean;
}

export interface SimResult {
  frames: PoolBallState[][]; // per-frame snapshots for animation
  final: PoolBallState[];
  events: ShotEvents;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// Simulate a shot: the cue ball starts with velocity (cueVx, cueVy); everything
// else starts at rest. Runs to rest (or the frame cap) and returns animation
// frames + the resting layout + what happened.
export function simulate(start: PoolBallState[], cueVx: number, cueVy: number): SimResult {
  const balls: Sim[] = start.map((b) => ({ ...b, vx: 0, vy: 0 }));
  const cue = balls.find((b) => b.i === 0);
  if (cue && !cue.in) {
    cue.vx = cueVx;
    cue.vy = cueVy;
  }

  const events: ShotEvents = { potted: [], firstHit: null, cuePotted: false };
  const frames: PoolBallState[][] = [];
  const R = TABLE.R;
  const minX = R;
  const maxX = TABLE.W - R;
  const minY = R;
  const maxY = TABLE.H - R;

  const snapshot = () => frames.push(balls.map((b) => ({ i: b.i, x: b.x, y: b.y, in: b.in })));
  snapshot();

  let frame = 0;
  let moving = true;
  while (moving && frame < MAX_FRAMES) {
    for (let s = 0; s < SUB; s++) {
      // integrate + damp
      for (const b of balls) {
        if (b.in) continue;
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        b.vx *= DAMP;
        b.vy *= DAMP;
      }
      // pockets (checked before walls so balls drop instead of bouncing)
      for (const b of balls) {
        if (b.in) continue;
        for (const p of POCKETS) {
          if (dist2(b.x, b.y, p.x, p.y) <= TABLE.POCKET * TABLE.POCKET) {
            b.in = true;
            b.vx = 0;
            b.vy = 0;
            events.potted.push(b.i);
            if (b.i === 0) events.cuePotted = true;
            break;
          }
        }
      }
      // cushions
      for (const b of balls) {
        if (b.in) continue;
        if (b.x < minX) {
          b.x = minX;
          b.vx = Math.abs(b.vx) * WALL_RESTITUTION;
        } else if (b.x > maxX) {
          b.x = maxX;
          b.vx = -Math.abs(b.vx) * WALL_RESTITUTION;
        }
        if (b.y < minY) {
          b.y = minY;
          b.vy = Math.abs(b.vy) * WALL_RESTITUTION;
        } else if (b.y > maxY) {
          b.y = maxY;
          b.vy = -Math.abs(b.vy) * WALL_RESTITUTION;
        }
      }
      // ball-ball (equal mass elastic)
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.in) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.in) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const minDist = 2 * R;
          if (d2 > 0 && d2 < minDist * minDist) {
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            // separate the overlap
            const overlap = minDist - d;
            a.x -= (nx * overlap) / 2;
            a.y -= (ny * overlap) / 2;
            b.x += (nx * overlap) / 2;
            b.y += (ny * overlap) / 2;
            // exchange velocity along the normal
            const va = a.vx * nx + a.vy * ny;
            const vb = b.vx * nx + b.vy * ny;
            const diff = vb - va;
            a.vx += diff * nx;
            a.vy += diff * ny;
            b.vx -= diff * nx;
            b.vy -= diff * ny;
            // record the cue's first object-ball contact
            if (events.firstHit === null) {
              if (a.i === 0 && b.i !== 0) events.firstHit = b.i;
              else if (b.i === 0 && a.i !== 0) events.firstHit = a.i;
            }
          }
        }
      }
    }
    snapshot();
    frame++;
    moving = balls.some((b) => !b.in && b.vx * b.vx + b.vy * b.vy > STOP_SPEED * STOP_SPEED);
  }

  // settle velocities to zero in the final snapshot
  const final = balls.map((b) => ({ i: b.i, x: b.x, y: b.y, in: b.in }));
  return { frames, final, events };
}

// True if placing the cue ball at (x,y) is legal for ball-in-hand: inside the
// rails and not overlapping any object ball still on the table.
export function isValidCuePlacement(x: number, y: number, balls: PoolBallState[]): boolean {
  const R = TABLE.R;
  if (x < R || x > TABLE.W - R || y < R || y > TABLE.H - R) return false;
  for (const b of balls) {
    if (b.i === 0 || b.in) continue;
    if (dist2(x, y, b.x, b.y) < (2 * R) * (2 * R)) return false;
  }
  return true;
}
