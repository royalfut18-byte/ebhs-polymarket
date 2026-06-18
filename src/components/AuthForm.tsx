"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Loader2, TrendingUp } from "lucide-react";
import { getSupabase, usernameToEmail } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { FadeIn } from "./motion";

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
  // Set once a sign-up request has been sent and is awaiting admin approval.
  const [submitted, setSubmitted] = useState(false);

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
        if (!instagram.trim()) {
          setError("Instagram is required (used for prize claims).");
          setLoading(false);
          return;
        }
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
        // New accounts must be approved by an admin before they can log in, so
        // we do NOT sign in here — we show the "waiting for approval" screen.
        setSubmitted(true);
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (signInError) {
        const msg = signInError.message.toLowerCase();
        // A banned account = a sign-up that is still pending (or was declined).
        const pending = msg.includes("ban") || (signInError as { code?: string }).code === "user_banned";
        setError(
          pending
            ? "This account is waiting for admin approval, or wasn't approved. Please check back later."
            : "Wrong username or password."
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

  // Sign-up request sent — waiting for an admin to approve the account.
  if (submitted) {
    return (
      <FadeIn className="mx-auto mt-12 w-full max-w-sm">
        <div className="card flex flex-col items-center gap-3 p-7 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-400/15 text-yellow-300">
            <Clock size={24} />
          </span>
          <h1 className="text-xl font-bold">Waiting for sign-up approval</h1>
          <p className="text-sm text-ink-dim">
            Your request to join as{" "}
            <span className="font-semibold text-ink">@{username.trim().toLowerCase()}</span> has been
            sent. An admin needs to approve your account before you can log in.
          </p>
          <p className="text-xs text-ink-faint">
            Check back soon, then log in with your username and password.
          </p>
          <Link href="/login" className="btn btn-ghost mt-1 w-full">
            Back to log in
          </Link>
        </div>
      </FadeIn>
    );
  }

  return (
    <FadeIn className="mx-auto mt-12 w-full max-w-sm">
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
              ? "Request access — an admin approves new accounts. Start with 1,000 free play credits."
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
                <span className="text-xs font-medium text-ink-dim">Instagram</span>
                <input
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@yourhandle"
                  required
                  className="input"
                />
                <span className="text-xs text-ink-faint">
                  Required — private, only admins see it, used for claiming prizes. 🔒
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
            {isSignup ? "Request to join" : "Log in"}
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
    </FadeIn>
  );
}
