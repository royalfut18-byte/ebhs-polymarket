// Types for the PvP arena (real-time, play-money wagering). Mirrors the schema
// in supabase/migrations/0015_arena.sql.

export type ArenaGame = "chess" | "uno";
export type ArenaMatchStatus = "active" | "finished" | "void";
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
