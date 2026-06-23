// 8-ball rules. Pure functions: given the state before a shot and what the
// physics reported, compute the resulting logical state (turn, groups, phase,
// fouls, winner). A pragmatic-but-faithful subset of standard 8-ball:
//   • Break, then the table is "open" until someone legally pots a ball; the
//     group of the first ball legally potted becomes that player's group.
//   • You keep shooting while you legally pot one of your own balls.
//   • Foul (scratch, no contact, or hitting the wrong ball first) → opponent
//     gets ball-in-hand. (The "must hit a rail" rule is intentionally omitted.)
//   • Pot the 8 after clearing your group to win; pot it early / on a foul /
//     scratch on the 8 → you lose.
import { TABLE } from "./physics";
import type { PoolBallState, PoolGroup, PoolState } from "@/lib/arena/types";
import type { ShotEvents } from "./physics";

export function groupOf(id: number): PoolGroup | "eight" | "cue" {
  if (id === 0) return "cue";
  if (id === 8) return "eight";
  return id <= 7 ? "solids" : "stripes";
}

function groupCleared(balls: PoolBallState[], group: PoolGroup): boolean {
  return balls.every((b) => (groupOf(b.i) === group ? b.in : true));
}

export interface ShotOutcome {
  state: PoolState;
  winnerSeat: number | null; // null = game continues
  foul: boolean;
}

// Resolve a completed shot into the next state.
export function resolveShot(
  before: PoolState,
  finalBalls: PoolBallState[],
  events: ShotEvents,
  shooterSeat: number,
  shot: { by: string; pre: PoolBallState[]; vx: number; vy: number }
): ShotOutcome {
  const preGroups = before.groups;
  const prePhase = before.phase;
  const otherSeat = shooterSeat === 0 ? 1 : 0;
  const myGroup = before.groups[String(shooterSeat)] ?? null;
  const pottedObjs = events.potted.filter((i) => i !== 0);
  const cueScratch = events.cuePotted;
  const wasBreak = before.phase === "break";

  // "on the 8": your group is assigned and fully cleared.
  const onEight = myGroup != null && groupCleared(finalBalls, myGroup);

  // --- fouls ---
  let foul = false;
  if (cueScratch) foul = true;
  if (events.firstHit === null) {
    foul = true; // hit nothing
  } else if (before.phase === "play" && myGroup) {
    const legalFirst = onEight ? events.firstHit === 8 : groupOf(events.firstHit) === myGroup;
    if (!legalFirst) foul = true;
  } else {
    // break or open table: hitting the 8 first is a foul
    if (events.firstHit === 8) foul = true;
  }

  // --- the 8 ball ---
  let winnerSeat: number | null = null;
  if (pottedObjs.includes(8)) {
    winnerSeat = onEight && !foul && !cueScratch ? shooterSeat : otherSeat;
  }

  // --- group assignment (first legal pot after the break) ---
  let groups = before.groups;
  let phase = before.phase;
  if (wasBreak) phase = "open";
  if (!wasBreak && groups[String(shooterSeat)] == null && !foul) {
    const firstObj = pottedObjs.find((i) => i !== 8);
    if (firstObj != null) {
      const g = groupOf(firstObj) as PoolGroup;
      groups = {
        [String(shooterSeat)]: g,
        [String(otherSeat)]: g === "solids" ? "stripes" : "solids",
      };
      phase = "play";
    }
  }

  // --- continuation ---
  const myGroupNow = groups[String(shooterSeat)] ?? null;
  const pottedOwn = pottedObjs.some(
    (i) => i !== 8 && (myGroupNow == null || groupOf(i) === myGroupNow)
  );
  const continues = winnerSeat == null && !foul && pottedOwn;

  // --- cue ball reset on scratch ---
  const balls = finalBalls.map((b) => ({ ...b }));
  if (cueScratch) {
    const cue = balls.find((b) => b.i === 0);
    if (cue) {
      cue.in = false;
      cue.x = TABLE.CUE_START.x;
      cue.y = TABLE.CUE_START.y;
    }
  }

  const done = winnerSeat != null;
  const state: PoolState = {
    balls,
    turn: done ? shooterSeat : continues ? shooterSeat : otherSeat,
    groups,
    phase: done ? "done" : phase,
    ballInHand: done ? false : foul,
    lastShot: {
      by: shot.by,
      pre: shot.pre,
      groups: preGroups,
      phase: prePhase,
      vx: shot.vx,
      vy: shot.vy,
      at: new Date().toISOString(),
    },
    pending: null, // the server stamps this for terminal shots
    last_shot_at: before.last_shot_at,
  };

  return { state, winnerSeat, foul };
}
