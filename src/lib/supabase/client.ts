"use client";

// Browser Supabase client (singleton). Uses the public anon key; all data
// access is governed by Row Level Security. Sessions persist in localStorage.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the Supabase env vars are present. UI shows a setup banner if not. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  // Fall back to harmless placeholders so createClient() doesn't throw when the
  // project hasn't been configured yet — calls will simply fail and the UI
  // surfaces a "configure Supabase" message.
  cached = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder-anon-key", {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

/** The email a username maps to, e.g. "ashaz" -> "ashaz@ebhs.local". */
export function usernameToEmail(username: string): string {
  const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || "ebhs.local";
  return `${username.trim().toLowerCase()}@${domain}`;
}
