// Data-fetching helpers for the PvP arena. All reads are RLS-governed: a user
// only sees matches/chat they're a participant in and challenges they're party
// to. Money + state mutations all go through the arena_* RPCs.

import { getSupabase } from "@/lib/supabase/client";
import type {
  ArenaChallenge,
  ArenaChatLine,
  ArenaMatch,
  ArenaMatchPlayer,
  ArenaPlayerLite,
  UnoOpenTable,
  UnoView,
} from "./types";

// Approved users who can be challenged (id + handle only — no real names).
export async function fetchArenaPlayers(): Promise<ArenaPlayerLite[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("approval_status", "approved")
    .order("username", { ascending: true });
  if (error) throw error;
  return (data as ArenaPlayerLite[]) ?? [];
}

// Pending challenges I'm party to (RLS already limits to me).
export async function fetchMyChallenges(): Promise<ArenaChallenge[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("arena_challenges")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ArenaChallenge[]) ?? [];
}

// My matches (active first), via my player rows with the match embedded.
export async function fetchMyMatches(userId: string): Promise<ArenaMatch[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("arena_match_players")
    .select("match:arena_matches(*)")
    .eq("user_id", userId);
  if (error) throw error;
  const rows = (data as unknown as { match: ArenaMatch | null }[]) ?? [];
  return rows
    .map((r) => r.match)
    .filter((m): m is ArenaMatch => !!m)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
}

export async function fetchMatch(matchId: string): Promise<ArenaMatch> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("arena_matches").select("*").eq("id", matchId).single();
  if (error) throw error;
  return data as ArenaMatch;
}

export async function fetchMatchPlayers(matchId: string): Promise<ArenaMatchPlayer[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("arena_match_players")
    .select("*, profiles(username)")
    .eq("match_id", matchId)
    .order("seat", { ascending: true });
  if (error) throw error;
  return (data as unknown as ArenaMatchPlayer[]) ?? [];
}

// Uno: the safe per-player snapshot (own hand + public state) via the RPC.
export async function fetchUnoView(matchId: string): Promise<UnoView> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("uno_view", { p_match: matchId });
  if (error) throw error;
  return data as UnoView;
}

// Uno: open lobby tables anyone can join.
export async function fetchUnoOpenTables(): Promise<UnoOpenTable[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("uno_open_tables");
  if (error) throw error;
  return (data as UnoOpenTable[]) ?? [];
}

export async function fetchMatchChat(matchId: string): Promise<ArenaChatLine[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("arena_chat")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data as ArenaChatLine[]) ?? [];
}
