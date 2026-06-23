"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, PartyPopper, RotateCw, Volume2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { formatMoney } from "@/lib/format";

// Responsible-play lock. When a signed-in user's net worth (cash + portfolio)
// is <= $50, the server reports `locked` and this full-screen overlay forces a
// reflection video before a $1000 reset. Server-driven, so refreshing re-shows
// it. Max 5 rehabs per day (resets midnight Sydney). The video auto-starts,
// can't be paused or seeked forward, shows live progress, and — as a safety
// net so no one is ever stuck — a Claim button appears once the server's watch
// timer has elapsed (e.g. if the video glitches or `ended` never fires).
interface Status {
  locked: boolean;
  net_worth?: number;
  required?: number;
  elapsed?: number;
  used?: number;
  max?: number;
}

const SYDNEY_TZ = "Australia/Sydney";
function msUntilSydneyMidnight(): number {
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: SYDNEY_TZ });
  let lo = now.getTime();
  let hi = lo + 27 * 3600 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (new Date(mid).toLocaleDateString("en-CA", { timeZone: SYDNEY_TZ }) === today) lo = mid;
    else hi = mid;
  }
  return hi - now.getTime();
}

export default function ReflectionGate() {
  const { user, profile, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const uid = user?.id;

  const { data, refetch } = useQuery<Status>({
    queryKey: ["reflection", uid],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reflection_status");
      if (error) throw error;
      return data as Status;
    },
    enabled: !!uid,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (uid) refetch();
  }, [profile?.balance, uid, refetch]);

  const vidRef = useRef<HTMLVideoElement>(null);
  const maxRef = useRef(0); // furthest point watched (blocks forward seeks)
  const startedRef = useRef(false);
  const lockStartRef = useRef<number | null>(null); // client-time estimate of lock start
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [rewarded, setRewarded] = useState(false);
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const locked = !!data?.locked;
  const used = data?.used ?? 0;
  const max = data?.max ?? 5;
  const required = data?.required ?? 205;
  const outOfRehabs = locked && used >= max;

  // 1s ticker for the claim-fallback timer + the midnight countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Re-anchor the lock-start estimate whenever fresh status arrives.
  useEffect(() => {
    if (locked && data && typeof data.elapsed === "number") {
      lockStartRef.current = Date.now() - data.elapsed * 1000;
    }
    if (!locked) lockStartRef.current = null;
  }, [locked, data]);

  function tryPlay() {
    const v = vidRef.current;
    if (!v || startedRef.current) return;
    v.muted = false;
    v.play()
      .then(() => {
        startedRef.current = true;
      })
      .catch(() => {
        // Autoplay-with-sound blocked → play muted (always allowed) + offer unmute.
        v.muted = true;
        setMuted(true);
        v.play()
          .then(() => {
            startedRef.current = true;
          })
          .catch(() => {});
      });
  }

  // New lock episode: reset the player and auto-start (fixes being stuck on a
  // finished video after a previous reward).
  useEffect(() => {
    if (!locked || outOfRehabs) return;
    setRewarded(false);
    setClosed(false);
    setProgress(0);
    setErr(null);
    maxRef.current = 0;
    startedRef.current = false;
    const v = vidRef.current;
    if (v) {
      try {
        v.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
      // If already buffered (e.g. a 2nd episode), kick it off now; otherwise
      // onCanPlay will start it once ready.
      const id = window.setTimeout(tryPlay, 60);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, outOfRehabs]);

  if (!uid || (!locked && !rewarded) || closed) return null;

  const elapsedSec = lockStartRef.current ? (now - lockStartRef.current) / 1000 : 0;
  const canClaim = locked && !outOfRehabs && elapsedSec >= required;

  function onTimeUpdate() {
    const v = vidRef.current;
    if (!v) return;
    if (v.currentTime > maxRef.current + 0.75) {
      v.currentTime = maxRef.current; // block forward seeks
      return;
    }
    if (v.currentTime > maxRef.current) maxRef.current = v.currentTime;
    setProgress(v.duration ? v.currentTime / v.duration : 0);
  }
  function onPause() {
    const v = vidRef.current;
    if (v && startedRef.current && !v.ended && !rewarded) v.play().catch(() => {});
  }
  function unmute() {
    const v = vidRef.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    v.play().catch(() => {});
  }
  function retryLoad() {
    const v = vidRef.current;
    if (!v) return;
    setLoadError(false);
    setLoading(true);
    v.load();
  }
  async function claim() {
    if (claiming || rewarded) return;
    setClaiming(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc("reflection_reward");
      if (error) throw error;
      setRewarded(true);
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 160, spread: 80, startVelocity: 45, origin: { y: 0.7 } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong — try again in a moment.");
    } finally {
      setClaiming(false);
    }
  }
  async function collect() {
    await refreshProfile();
    await refetch();
    setClosed(true);
  }

  const pct = Math.round(progress * 100);

  // Countdown to the Sydney midnight reset (for the out-of-rehabs screen).
  const resetMs = msUntilSydneyMidnight();
  const rh = Math.floor(resetMs / 3600000);
  const rm = Math.floor((resetMs % 3600000) / 60000);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/92 p-4 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-bg-card p-5 shadow-card sm:p-7">
        {rewarded ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yes/15 text-yes-text">
              <PartyPopper size={30} />
            </div>
            <h2 className="text-2xl font-black">Here&apos;s your reward 🎉</h2>
            <p className="max-w-md text-sm text-ink-dim">
              Thanks for taking a moment to reflect. We&apos;ve added{" "}
              <span className="font-bold text-yes-text">{formatMoney(1000)}</span> to your balance — play responsibly.
            </p>
            <button onClick={collect} className="btn btn-primary px-6 py-2.5">
              Collect {formatMoney(1000)} &amp; continue
            </button>
          </div>
        ) : outOfRehabs ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
              <Lock size={28} />
            </div>
            <h2 className="text-xl font-black">That&apos;s all {max} rehabs for today</h2>
            <p className="max-w-md text-sm text-ink-dim">
              You&apos;ve used every reset for today. Take a real break — your rehabs refresh at midnight.
            </p>
            <div className="rounded-xl border border-border bg-bg-soft/60 px-4 py-2 text-sm">
              Resets in <span className="font-bold text-ink">{rh}h {rm}m</span>
            </div>
            <button onClick={() => setClosed(true)} className="btn btn-ghost px-6 py-2">
              Got it
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
                <Lock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold leading-tight">Time to reflect on your actions</h2>
                <p className="text-xs text-ink-dim">
                  You&apos;re down to {formatMoney(data?.net_worth ?? 0)}. Watch this in full to be rewarded {formatMoney(1000)}.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums text-ink">
                Rehab {Math.min(used + 1, max)}/{max}
              </span>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                ref={vidRef}
                src="/reflect.mp4"
                className="block max-h-[60vh] w-full"
                playsInline
                autoPlay
                preload="auto"
                controls={false}
                disablePictureInPicture
                controlsList="nodownload noplaybackrate noremoteplayback"
                onCanPlay={() => {
                  setLoading(false);
                  tryPlay();
                }}
                onWaiting={() => setLoading(true)}
                onPlaying={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setLoadError(true);
                }}
                onTimeUpdate={onTimeUpdate}
                onPause={onPause}
                onEnded={claim}
              />
              {loading && !loadError && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Loader2 size={28} className="animate-spin" />
                </div>
              )}
              {loadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-white">
                  <p className="text-sm">The video had trouble loading.</p>
                  <button onClick={retryLoad} className="btn btn-primary px-4 py-2 text-sm">
                    <RotateCw size={15} /> Retry
                  </button>
                  <p className="max-w-xs text-xs text-white/60">
                    You can still claim your reward below once the timer is up.
                  </p>
                </div>
              )}
              {muted && !loadError && (
                <button
                  onClick={unmute}
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/30"
                >
                  <Volume2 size={14} /> Tap for sound
                </button>
              )}
            </div>

            {/* live progress bar */}
            <div className="mt-4">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-300 transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-ink-faint">
                <span>{claiming ? "Saving your reward…" : loadError ? "Video unavailable" : "Watching…"}</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
            </div>

            {/* claim — auto on `ended`, or manual once the watch timer is up so
                no one is ever stuck (covers glitches / a failed video load). */}
            {canClaim && (
              <button onClick={claim} disabled={claiming} className="btn btn-primary mt-3 w-full py-2.5">
                {claiming ? <Loader2 size={16} className="animate-spin" /> : <PartyPopper size={16} />}
                Claim your {formatMoney(1000)}
              </button>
            )}

            {err && <p className="mt-2 text-center text-sm text-no-text">{err}</p>}
            <p className="mt-3 text-center text-[11px] text-ink-faint">
              This can&apos;t be skipped — it&apos;s here to help you take a breather. 💙 Max {max} rehabs a day.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
