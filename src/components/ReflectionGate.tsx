"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, PartyPopper, Play } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { formatMoney } from "@/lib/format";

// Responsible-play lock. When a signed-in user's net worth (cash + portfolio)
// is <= $50, the server reports `locked` and this full-screen overlay forces
// them to watch a reflection video before a $1000 reset is granted. It is
// SERVER-driven, so refreshing the page just re-shows it. The video cannot be
// paused or seeked forward, progress is shown live, and the reward only lands
// once the server agrees enough time has elapsed (see migration 0027).
interface Status {
  locked: boolean;
  net_worth?: number;
  required?: number;
  elapsed?: number;
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
    refetchInterval: 20000, // backstop; the balance-change effect catches crossings promptly
    refetchOnWindowFocus: true,
  });

  // Re-check promptly whenever the balance changes (a losing bet may cross the
  // threshold) so the gate appears without waiting for the poll.
  useEffect(() => {
    if (uid) refetch();
  }, [profile?.balance, uid, refetch]);

  const vidRef = useRef<HTMLVideoElement>(null);
  const maxRef = useRef(0);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [rewarded, setRewarded] = useState(false);
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const locked = !!data?.locked;
  const key = uid ? `reflect-progress-${uid}` : "reflect-progress";

  // Reset local UI when a new lock episode begins.
  useEffect(() => {
    if (locked) {
      setClosed(false);
      setRewarded(false);
      const saved = Number(localStorage.getItem(key) || 0);
      maxRef.current = Number.isFinite(saved) ? saved : 0;
    }
  }, [locked, key]);

  if (!uid || (!locked && !rewarded) || closed) return null;

  function onLoaded() {
    const v = vidRef.current;
    if (!v) return;
    // Resume where they left off (a refresh can't be used to skip ahead).
    if (maxRef.current > 1 && maxRef.current < v.duration - 1) v.currentTime = maxRef.current;
  }
  function onTimeUpdate() {
    const v = vidRef.current;
    if (!v) return;
    // Block any forward seek past the furthest point actually watched.
    if (v.currentTime > maxRef.current + 0.75) {
      v.currentTime = maxRef.current;
      return;
    }
    if (v.currentTime > maxRef.current) {
      maxRef.current = v.currentTime;
      localStorage.setItem(key, String(maxRef.current));
    }
    setProgress(v.duration ? v.currentTime / v.duration : 0);
  }
  function onPause() {
    const v = vidRef.current;
    if (v && started && !v.ended) v.play().catch(() => {});
  }
  function begin() {
    const v = vidRef.current;
    if (!v) return;
    v.play().finally(() => setStarted(true));
  }
  async function onEnded() {
    setClaiming(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc("reflection_reward");
      if (error) throw error;
      localStorage.removeItem(key);
      setRewarded(true);
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 160, spread: 80, startVelocity: 45, origin: { y: 0.7 } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong — let the video finish and try again.");
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

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/92 p-4 backdrop-blur-sm" onContextMenu={(e) => e.preventDefault()}>
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
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
                <Lock size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">Time to reflect on your actions</h2>
                <p className="text-xs text-ink-dim">
                  You&apos;re down to {formatMoney(data?.net_worth ?? 0)}. Watch this in full to be rewarded {formatMoney(1000)}.
                </p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                ref={vidRef}
                src="/reflect.mp4"
                className="block max-h-[60vh] w-full"
                playsInline
                preload="auto"
                controls={false}
                disablePictureInPicture
                controlsList="nodownload noplaybackrate noremoteplayback"
                onLoadedMetadata={onLoaded}
                onTimeUpdate={onTimeUpdate}
                onPause={onPause}
                onEnded={onEnded}
              />
              {!started && (
                <button
                  onClick={begin}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
                    <Play size={28} className="ml-1" />
                  </span>
                  <span className="text-sm font-semibold">Begin reflection</span>
                  <span className="max-w-xs px-4 text-center text-xs text-white/70">
                    You must reflect upon your actions before being rewarded {formatMoney(1000)}.
                  </span>
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
                <span>{claiming ? "Saving your reward…" : started ? "Watching…" : "Not started"}</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
            </div>

            {claiming && (
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-dim">
                <Loader2 size={15} className="animate-spin" /> Granting your reward…
              </div>
            )}
            {err && <p className="mt-2 text-center text-sm text-no-text">{err}</p>}
            <p className="mt-3 text-center text-[11px] text-ink-faint">
              This can&apos;t be skipped or closed — it&apos;s here to help you take a breather. 💙
            </p>
          </>
        )}
      </div>
    </div>
  );
}
