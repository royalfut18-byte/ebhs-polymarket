"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Instagram, KeyRound, Loader2, User as UserIcon } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "@/lib/supabase/client";
import { FadeIn } from "./motion";

// Self-service account settings: edit the private name + Instagram (used for
// prize claims, admin-only visibility) and change your own password.
export default function SettingsForm() {
  const router = useRouter();
  const supabase = getSupabase();
  const { user, profile, loading, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [loadedPrivate, setLoadedPrivate] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [username, setUsername] = useState("");
  const [usernameLoaded, setUsernameLoaded] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Not logged in? Bounce to login.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Seed the username field from the loaded profile (once).
  useEffect(() => {
    if (profile && !usernameLoaded) {
      setUsername(profile.username);
      setUsernameLoaded(true);
    }
  }, [profile, usernameLoaded]);

  // Load the caller's own private profile (RLS returns just their row).
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("profiles_private")
        .select("full_name, instagram")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      setFullName((data?.full_name as string) ?? "");
      setInstagram(((data?.instagram as string) ?? "").replace(/^@+/, ""));
      setLoadedPrivate(true);
    })();
    return () => {
      active = false;
    };
  }, [user, supabase]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setProfileMsg(null);
    const { error } = await supabase
      .from("profiles_private")
      .update({
        full_name: fullName.trim(),
        instagram: instagram.trim().replace(/^@+/, ""),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    setSavingProfile(false);
    setProfileMsg(
      error ? { ok: false, text: error.message } : { ok: true, text: "Saved." }
    );
  }

  async function changeUsername(e: React.FormEvent) {
    e.preventDefault();
    const next = username.trim().toLowerCase();
    if (!profile) return;
    if (next === profile.username) {
      setUsernameMsg({ ok: false, text: "That's already your username." });
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(next)) {
      setUsernameMsg({ ok: false, text: "3–20 letters, numbers or underscores." });
      return;
    }
    setSavingUsername(true);
    setUsernameMsg(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/account/username", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ username: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setUsernameMsg({ ok: false, text: json.error ?? "Couldn't change username." });
      } else {
        setUsername(next);
        setUsernameMsg({ ok: true, text: "Username updated." });
        await refreshProfile();
      }
    } catch {
      setUsernameMsg({ ok: false, text: "Something went wrong." });
    } finally {
      setSavingUsername(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 6) {
      setPwMsg({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: "Passwords don't match." });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) {
      setPwMsg({ ok: false, text: error.message });
    } else {
      setPwMsg({ ok: true, text: "Password changed." });
      setNewPw("");
      setConfirmPw("");
    }
  }

  if (loading || !profile) {
    return <div className="py-20 text-center text-ink-faint">Loading…</div>;
  }

  return (
    <FadeIn className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-ink-dim">Manage your profile and password.</p>
      </div>

      {/* Username */}
      <form onSubmit={changeUsername} className="card flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-dim">
          <UserIcon size={15} /> Username
        </h2>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-dim">
            Your public handle — shown everywhere as @{profile.username}
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              @
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!usernameLoaded}
              autoComplete="off"
              placeholder="username"
              className="input pl-7 lowercase"
            />
          </div>
          <span className="text-xs text-ink-faint">
            You&apos;ll log in with the new username afterwards. Old profile links will stop working.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savingUsername || !usernameLoaded || username.trim().toLowerCase() === profile.username}
            className="btn btn-primary"
          >
            {savingUsername ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Change username
          </button>
          {usernameMsg && (
            <span className={usernameMsg.ok ? "text-sm text-yes-text" : "text-sm text-no-text"}>
              {usernameMsg.text}
            </span>
          )}
        </div>
      </form>

      {/* Profile (private name + Instagram) */}
      <form onSubmit={saveProfile} className="card flex flex-col gap-3 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">Profile</h2>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-dim">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your real name"
            disabled={!loadedPrivate}
            className="input"
          />
          <span className="text-xs text-ink-faint">Private — only admins can see this. 🔒</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-dim">Instagram</span>
          <div className="relative">
            <Instagram
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="yourhandle"
              disabled={!loadedPrivate}
              className="input pl-9"
            />
          </div>
          <span className="text-xs text-ink-faint">Used for prize claims. Private — admins only.</span>
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={savingProfile || !loadedPrivate} className="btn btn-primary">
            {savingProfile ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Save profile
          </button>
          {profileMsg && (
            <span className={profileMsg.ok ? "text-sm text-yes-text" : "text-sm text-no-text"}>
              {profileMsg.text}
            </span>
          )}
        </div>
      </form>

      {/* Password */}
      <form onSubmit={changePassword} className="card flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-dim">
          <KeyRound size={15} /> Change password
        </h2>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-dim">New password</span>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-dim">Confirm new password</span>
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            className="input"
          />
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={savingPw} className="btn btn-primary">
            {savingPw ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            Update password
          </button>
          {pwMsg && (
            <span className={pwMsg.ok ? "text-sm text-yes-text" : "text-sm text-no-text"}>
              {pwMsg.text}
            </span>
          )}
        </div>
      </form>
    </FadeIn>
  );
}
