// Types for the PvP arena (real-time, play-money wagering). Mirrors the schema
// in supabase/migrations/0015_arena.sql.

export type ArenaGame = "chess" | "uno" | "pool";
export type ArenaMatchStatus = "lobby" | "active" | "finished" | "void";
export type ChallengeStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface ChessMove {
  from: string;
  to: string;
  promotion?: string | null;
  san: string;
}

export interface ChessPending {
  type: "checkmate" | "draw";
  by: string;
  winner: string | null;
  at: string;
}

export interface ChessState {
  fen: string;
  moves: ChessMove[];
  last_move_at: string;
  draw_offer: string | null;
  pending: ChessPending | null;
}

export interface ArenaMatch {
  id: string;
  game: ArenaGame;
  status: ArenaMatchStatus;
  stake: number;
  pot: number;
  state: ChessState & Record<string, unknown>;
  winner_id: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface ArenaMatchPlayer {
  match_id: string;
  user_id: string;
  seat: number;
  role: string | null;
  stake: number;
  outcome: string | null;
  profiles?: { username: string } | null;
}

export interface ArenaChallenge {
  id: string;
  game: ArenaGame;
  challenger_id: string;
  opponent_id: string;
  stake: number;
  status: ChallengeStatus;
  match_id: string | null;
  created_at: string;
}

export interface ArenaChatLine {
  id: string;
  match_id: string;
  user_id: string;
  kind: "msg" | "reaction";
  body: string;
  created_at: string;
}

export interface ArenaPlayerLite {
  id: string;
  username: string;
}

// ---------------------------------------------------------------------------
// Uno
// ---------------------------------------------------------------------------

export type UnoColor = "r" | "y" | "g" | "b" | "w";
export type UnoValue =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "skip" | "rev" | "draw2" | "wild" | "wild4";

export interface UnoCard {
  c: UnoColor;
  v: UnoValue;
}

export interface UnoPlayer {
  user_id: string;
  username: string;
  seat: number;
  count?: number; // cards in hand (active game)
  left?: boolean; // forfeited mid-game
}

export interface UnoLogLine {
  u: string | null;
  t: string;
  at: string;
}

// The single safe snapshot returned by the uno_view() RPC.
export interface UnoView {
  status: ArenaMatchStatus | "lobby";
  result?: string | null;
  winner_id?: string | null;
  pot: number;
  stake: number;
  max_players?: number;
  host_id: string | null;
  my_seat: number | null;
  my_hand: UnoCard[];
  color?: UnoColor;
  direction?: number;
  pending_draw?: number;
  pending_type?: "draw2" | "wild4" | null;
  current_user_id?: string | null;
  top?: UnoCard | null;
  players: UnoPlayer[];
  log?: UnoLogLine[];
  last_action_at?: string;
}

// A joinable lobby table (uno_open_tables() RPC).
export interface UnoOpenTable {
  match_id: string;
  stake: number;
  max_players: number;
  created_at: string;
  joined: number;
  host_id: string | null;
  host_username: string | null;
}

// ---------------------------------------------------------------------------
// Pool (8-ball)
// ---------------------------------------------------------------------------

export type PoolGroup = "solids" | "stripes";
export type PoolPhase = "break" | "open" | "play" | "done";

// A ball at rest. i=0 is the cue, 1-7 solids, 8 the eight, 9-15 stripes.
// `in` = pocketed (off the table). The cue is never permanently `in`.
export interface PoolBallState {
  i: number;
  x: number;
  y: number;
  in: boolean;
}

// The last shot, stored so the opponent can re-simulate + animate it. `pre` is
// the exact pre-shot layout so the replay is independent of what the opponent
// last rendered.
export interface PoolShot {
  by: string;
  pre: PoolBallState[];
  // Pre-shot groups + phase, so the opponent can fully re-derive the outcome
  // (and verify a claimed win) by replaying the shot.
  groups: Record<string, PoolGroup | null>;
  phase: PoolPhase;
  vx: number;
  vy: number;
  at: string;
}

// A parked game-ending result awaiting the loser's confirmation (same pattern
// as chess) — finalised on confirm, or claimed after a grace period.
export interface PoolPending {
  type: "win";
  winner: string;
  by: string;
  at: string;
}

export interface PoolState {
  balls: PoolBallState[];
  turn: number; // seat to shoot (0 or 1)
  groups: Record<string, PoolGroup | null>; // keyed by seat ("0"/"1")
  phase: PoolPhase;
  ballInHand: boolean; // current shooter may reposition the cue ball
  lastShot: PoolShot | null;
  pending: PoolPending | null;
  last_shot_at?: string;
}
