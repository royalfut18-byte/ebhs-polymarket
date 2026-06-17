// Centralised data-fetching helpers built on the browser Supabase client.
// All reads here are governed by RLS (everything public is world-readable).

import { getSupabase } from "./supabase/client";
import type {
  AdminMessage,
  CasinoBet,
  CasinoGame,
  Category,
  CommentWithProfile,
  LeaderboardRow,
  Market,
  MarketStat,
  MarketSuggestion,
  Position,
  PositionWithMarket,
  Prizes,
  Profile,
  ProfilePrivate,
  SupportMessage,
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

export async function fetchCategories(): Promise<Category[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as Category[]) ?? [];
}

export async function fetchMarketStats(): Promise<Record<string, MarketStat>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("market_stats").select("*");
  if (error) throw error;
  const map: Record<string, MarketStat> = {};
  for (const row of (data as MarketStat[]) ?? []) map[row.market_id] = row;
  return map;
}

export async function fetchGroupMarkets(groupId: string): Promise<Market[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Market[]) ?? [];
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
    .select("*, profiles(username)")
    .eq("market_id", marketId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as TradeWithProfile[]) ?? [];
}

export async function fetchMarketHolders(marketId: string): Promise<
  (Position & { profiles: Pick<Profile, "username"> | null })[]
> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("positions")
    .select("*, profiles(username)")
    .eq("market_id", marketId)
    .order("shares", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as unknown as (Position & {
    profiles: Pick<Profile, "username"> | null;
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
    .select("*, profiles(username)")
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

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

// Private profile data (real name + Instagram). RLS returns all rows for admins,
// only the caller's own row otherwise. Keyed by user_id.
export async function fetchProfilesPrivate(): Promise<Record<string, ProfilePrivate>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("profiles_private").select("*");
  if (error) throw error;
  const map: Record<string, ProfilePrivate> = {};
  for (const r of (data as ProfilePrivate[]) ?? []) map[r.user_id] = r;
  return map;
}

export async function fetchPrizes(): Promise<Prizes | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "leaderboard_prizes")
    .maybeSingle();
  if (error) throw error;
  return ((data?.value as Prizes) ?? null) || null;
}

export async function fetchAdminMessages(): Promise<AdminMessage[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("admin_messages")
    .select("*, profiles(username)")
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data as unknown as AdminMessage[]) ?? [];
}

export async function fetchSupportThread(ticketUserId: string): Promise<SupportMessage[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .eq("ticket_user_id", ticketUserId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as SupportMessage[]) ?? [];
}

// All support messages the caller can see (staff see everything). Newest first.
export async function fetchSupportInbox(): Promise<SupportMessage[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data as SupportMessage[]) ?? [];
}

// A player's own casino bet log (RLS restricts to their own rows). Newest
// first. Pass a game to filter to one game's recent results.
export async function fetchCasinoHistory(
  userId: string,
  game?: CasinoGame,
  limit = 50
): Promise<CasinoBet[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("casino_bets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (game) query = query.eq("game", game);
  const { data, error } = await query;
  if (error) throw error;
  return (data as CasinoBet[]) ?? [];
}

export async function fetchMarketSuggestions(): Promise<MarketSuggestion[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("market_suggestions")
    .select("*, profiles(username)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as MarketSuggestion[]) ?? [];
}
