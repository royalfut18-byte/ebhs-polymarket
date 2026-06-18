"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type { ApprovalStatus, Profile, Role } from "@/lib/types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  approvalStatus: ApprovalStatus | null;
  isApproved: boolean;
  isAdmin: boolean;
  isStaff: boolean; // admin OR subadmin (can manage markets)
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      setProfile((data as Profile) ?? null);
    },
    [supabase]
  );

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        if (data.session?.user) await fetchProfile(data.session.user.id);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      if (newSession?.user) {
        fetchProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      approvalStatus: profile?.approval_status ?? null,
      // No profile yet (still loading) counts as approved so we don't flash the
      // gate; the gate only triggers on a profile that is explicitly not approved.
      isApproved: !profile || profile.approval_status === "approved",
      isAdmin: profile?.role === "admin",
      isStaff: profile?.role === "admin" || profile?.role === "subadmin",
      loading,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
