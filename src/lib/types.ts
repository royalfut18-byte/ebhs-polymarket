// Domain types shared across the app. These mirror the Postgres schema in
// supabase/migrations/0001_init.sql. All currency is FAKE play money.

export type Role = "admin" | "subadmin" | "user";
export type MarketStatus = "open" | "closed" | "resolved" | "cancelled";
export type Outcome = "yes" | "no";
export type TradeSide = "buy" | "sell";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  balance: number;
  created_at: string;
  last_spin_at: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_user_id: string;
  sender_id: string | null;
  from_staff: boolean;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, "username"> | null;
}

export interface Market {
  id: string;
  question: string;
  description: string;
  category: string;
  image_url: string | null;
  created_by: string | null;
  status: MarketStatus;
  resolution: Outcome | null;
  b: number;
  q_yes: number;
  q_no: number;
  initial_prob: number;
  close_at: string | null;
  created_at: string;
  resolved_at: string | null;
  // Multi-outcome (grouped) markets: null for standalone binary markets.
  group_id: string | null;
  group_title: string | null;
  option_label: string | null;
}

export interface Position {
  id: string;
  user_id: string;
  market_id: string;
  outcome: Outcome;
  shares: number;
  avg_price: number;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  user_id: string | null;
  market_id: string;
  outcome: Outcome;
  side: TradeSide;
  shares: number;
  cost: number;
  price_before: number;
  price_after: number;
  created_at: string;
}

export interface Comment {
  id: string;
  market_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface MarketStat {
  market_id: string;
  volume: number;
  trade_count: number;
  trader_count: number;
}

export interface Category {
  name: string;
  emoji: string;
  sort_order: number;
}

export interface LeaderboardRow {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  balance: number;
  net_worth: number;
}

// Result returned by the execute_trade RPC.
export interface TradeResult {
  side: TradeSide;
  outcome: Outcome;
  shares: number;
  cost: number;
  avg_price: number;
  price_before: number;
  price_after: number;
  new_balance: number;
}

// A trade joined with the trader's username (for the activity feed).
export interface TradeWithProfile extends Trade {
  profiles: Pick<Profile, "username"> | null;
}

// A comment joined with its author's username.
export interface CommentWithProfile extends Comment {
  profiles: Pick<Profile, "username"> | null;
}

// A position joined with its market (for the portfolio page).
export interface PositionWithMarket extends Position {
  markets: Market | null;
}

// A trade joined with its market's question (for the trade-history list).
export interface UserTradeRow extends Trade {
  markets: { question: string } | null;
}

// Private profile data — visible only to the user themselves and to admins.
export interface ProfilePrivate {
  user_id: string;
  full_name: string;
  instagram: string;
  updated_at: string;
}

// Staff chat message joined with the sender's username.
export interface AdminMessage {
  id: string;
  user_id: string | null;
  body: string;
  created_at: string;
  profiles: Pick<Profile, "username"> | null;
}

// User-submitted market idea joined with the suggester's username.
export interface MarketSuggestion {
  id: string;
  user_id: string | null;
  question: string;
  description: string;
  created_at: string;
  profiles: Pick<Profile, "username"> | null;
}

// Leaderboard prize configuration (freely editable by admins).
export interface PrizeEntry {
  place: string;
  reward: string;
}
export interface Prizes {
  title: string;
  entries: PrizeEntry[];
}

// ---------------------------------------------------------------------------
// Casino
// ---------------------------------------------------------------------------

// A playing card as returned by the casino RPCs: rank 1-13 (1=A, 11=J, 12=Q,
// 13=K), suit 0-3 (♠ ♥ ♦ ♣).
export interface Card {
  r: number;
  s: number;
}

export type CasinoGame =
  | "dice"
  | "limbo"
  | "crash"
  | "mines"
  | "keno"
  | "roulette"
  | "blackjack"
  | "baccarat"
  | "hilo";

// A completed bet, logged for the player's history (casino_bets table).
export interface CasinoBet {
  id: string;
  user_id: string;
  game: CasinoGame;
  bet: number;
  payout: number;
  multiplier: number;
  result: Record<string, unknown> | null;
  created_at: string;
}
