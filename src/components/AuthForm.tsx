"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, TrendingUp } from "lucide-react";
import { getSupabase, usernameToEmail } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const supabase = getSupabase();
  const { user, loading: authLoading } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in? Bounce home.
  useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, fullName, instagram }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Sign up failed.");
          setLoading(false);
          return;
        }
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (signInError) {
        setError(
          mode === "login"
            ? "Wrong username or password."
            : `Signed up, but couldn't log in: ${signInError.message}`
        );
        setLoading(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="mx-auto mt-10 w-full max-w-sm">
      <div className="card p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white">
            <TrendingUp size={22} strokeWidth={2.6} />
          </span>
          <h1 className="text-xl font-bold">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-ink-dim">
            {isSignup
              ? "Start with 1,000 free play credits."
              : "Log in to trade with your play credits."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-dim">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              placeholder="Pick a username"
              className="input"
            />
            {isSignup && (
              <span className="text-xs text-ink-faint">
                This is the only name other players see.
              </span>
            )}
          </label>

          {isSignup && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-dim">Full name (optional)</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your real name"
                  className="input"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-dim">Instagram (optional)</span>
                <input
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@yourhandle"
                  className="input"
                />
                <span className="text-xs text-ink-faint">
                  Private — only admins see this, used for claiming prizes. 🔒
                </span>
              </label>
            </>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-dim">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              placeholder="••••••••"
              className="input"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-no/30 bg-no/10 p-2.5 text-xs text-no-text">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary mt-1 w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {isSignup ? "Sign up" : "Log in"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-ink-dim">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-brand hover:underline">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="font-medium text-brand hover:underline">
                Create an account
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
