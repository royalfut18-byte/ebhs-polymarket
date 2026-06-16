// Centralised data-fetching helpers built on the browser Supabase client.
// All reads here are governed by RLS (everything public is world-readable).

import { getSupabase } from "./supabase/client";
import type {
  CommentWithProfile,
  LeaderboardRow,
  Market,
  MarketStat,
  Position,
  PositionWithMarket,
  Profile,
  TradeWithProfile,
  UserTradeRow,
} from "./types";

export async function fetchMarkets(): Promise<Market[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Market[]) ?? [];
}

export async function fetchMarketStats(): Promise<Record<string, MarketStat>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("market_stats").select("*");
  if (error) throw error;
  const map: Record<string, MarketStat> = {};
  for (const row of (data as MarketStat[]) ?? []) map[row.market_id] = row;
  return map;
}

export async function fetchMarket(id: string): Promise<Market> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("markets").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Market;
}

export async function fetchMarketTrades(marketId: string): Promise<TradeWithProfile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("trades")
    .select("*, profiles(username, display_name)")
    .eq("market_id", marketId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as TradeWithProfile[]) ?? [];
}

export async function fetchMarketHolders(marketId: string): Promise<
  (Position & { profiles: Pick<Profile, "username" | "display_name"> | null })[]
> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("positions")
    .select("*, profiles(username, display_name)")
    .eq("market_id", marketId)
    .order("shares", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as unknown as (Position & {
    profiles: Pick<Profile, "username" | "display_name"> | null;
  })[]) ?? [];
}

export async function fetchUserPositions(userId: string): Promise<PositionWithMarket[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("positions")
    .select("*, markets(*)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as PositionWithMarket[]) ?? [];
}

export async function fetchUserTrades(userId: string): Promise<UserTradeRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("trades")
    .select("*, markets(question)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as unknown as UserTradeRow[]) ?? [];
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .order("net_worth", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as LeaderboardRow[]) ?? [];
}

export async function fetchComments(marketId: string): Promise<CommentWithProfile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("comments")
    .select("*, profiles(username, display_name)")
    .eq("market_id", marketId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as CommentWithProfile[]) ?? [];
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Profile[]) ?? [];
}
