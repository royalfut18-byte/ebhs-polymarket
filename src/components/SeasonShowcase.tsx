"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Palette,
  Spade,
  Bird,
  Flame,
  Rocket,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

// Bump this key to re-show the reel to everyone after a future update.
const SEEN_KEY = "ebpoly_s2_whatsnew_v1";
const SCENE_MS = 3400; // time each scene holds before auto-advancing

type Scene = {
  Icon: LucideIcon;
  accent: string; // hex — drives the medallion, glow and progress fill
  glow: string; // rgba for the ambient radial glow
  title: string;
  sub: string;
};

const SCENES: Scene[] = [
  {
    Icon: Sparkles,
    accent: "#2f80ff",
    glow: "rgba(47,128,255,0.45)",
    title: "Season 2 is live",
    sub: "Here's everything that's new.",
  },
  {
    Icon: Palette,
    accent: "#6aa6ff",
    glow: "rgba(106,166,255,0.45)",
    title: "A brand-new look",
    sub: "The entire app, reimagined in deep navy blue.",
  },
  {
    Icon: Spade,
    accent: "#a855f7",
    glow: "rgba(168,85,247,0.45)",
    title: "The Casino, reborn",
    sub: "A sleek new lobby — ten originals, one tap away.",
  },
  {
    Icon: Bird,
    accent: "#84cc16",
    glow: "rgba(132,204,22,0.45)",
    title: "Flappy Bird is back",
    sub: "Flap past the pipes and cash out before you crash — up to 100×.",
  },
  {
    Icon: Flame,
    accent: "#f97316",
    glow: "rgba(249,115,22,0.45)",
    title: "Trending, front & center",
    sub: "The hottest markets, right on your home page.",
  },
  {
    Icon: Rocket,
    accent: "#f5b301",
    glow: "rgba(245,179,1,0.45)",
    title: "Welcome to Season 2",
    sub: "New season — everyone starts at $1,000. Climb the leaderboard.",
  },
];

// A one-time "what's new" reel. Plays once ever (persisted in localStorage),
// sequenced to appear right after the per-session intro splash.
// Perf: transform + opacity only — no animated blur / width / height.
export default function SeasonShowcase() {
  const [show, setShow] = useState(false); // mounted?
  const [closing, setClosing] = useState(false); // fading out before unmount
  const [i, setI] = useState(0);

  // Decide whether/when to show, coordinating with the intro splash.
  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY) === "1") return; // already seen — never again
    const introWillPlay = sessionStorage.getItem("ebpoly_intro_s2") !== "1";
    if (!introWillPlay) {
      setShow(true); // no intro this session — go straight to the reel
      return;
    }
    const onIntroDone = () => setShow(true);
    window.addEventListener("ebpoly-intro-done", onIntroDone, { once: true });
    return () => window.removeEventListener("ebpoly-intro-done", onIntroDone);
  }, []);

  // Auto-advance through the scenes; mark seen once we reach the last one.
  useEffect(() => {
    if (!show) return;
    if (i >= SCENES.length - 1) {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {}
      return;
    }
    const t = setTimeout(() => setI((n) => n + 1), SCENE_MS);
    return () => clearTimeout(t);
  }, [show, i]);

  function enter() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    // Fade out, then hard-unmount ourselves. We don't lean on AnimatePresence
    // here — its exit can hang and leave an invisible full-screen blocker.
    setClosing(true);
    setTimeout(() => setShow(false), 480);
  }

  const scene = SCENES[i];
  const isLast = i === SCENES.length - 1;

  if (!show) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center overflow-hidden bg-[#070f1e] px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      style={{ pointerEvents: closing ? "none" : undefined }}
    >
          {/* header */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-center pt-7">
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-light/80">
              What&apos;s new · Season 2
            </span>
          </div>

          {/* ambient glow — colour crossfades with the scene, scaled via transform.
              No mode="wait": scenes crossfade (both briefly mounted) so a stalled
              exit can never freeze the reel on one slide. */}
          <AnimatePresence>
            <motion.div
              key={`glow-${i}`}
              className="pointer-events-none absolute h-[42rem] w-[42rem] rounded-full"
              style={{
                background: `radial-gradient(circle, ${scene.glow}, rgba(47,128,255,0) 65%)`,
                willChange: "transform, opacity",
              }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1.08 }}
              exit={{ opacity: 0, transition: { duration: 0.6 } }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          </AnimatePresence>

          {/* the scene — absolutely-positioned children crossfade in place */}
          <div className="relative flex h-[360px] w-full max-w-xl items-center justify-center text-center">
            <AnimatePresence>
              <motion.div
                key={`scene-${i}`}
                className="absolute inset-0 flex flex-col items-center justify-center"
                initial={{ opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -22 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                {/* medallion — float via CSS keyframe (not framer) so the
                    infinite loop can't stall AnimatePresence exit */}
                <div
                  className="relative mb-8 flex h-28 w-28 items-center justify-center rounded-[1.75rem] ring-1 ring-white/20"
                  style={{
                    background: `linear-gradient(135deg, ${scene.accent}, #0b1a33)`,
                    boxShadow: `0 24px 60px -18px ${scene.glow}, inset 0 1px 0 rgba(255,255,255,0.4)`,
                    animation: "s2-float 3s ease-in-out infinite",
                    willChange: "transform",
                  }}
                >
                  <div className="absolute inset-0 rounded-[1.75rem] bg-gradient-to-b from-white/25 to-transparent opacity-70" />
                  <scene.Icon
                    size={52}
                    strokeWidth={2.1}
                    className="relative text-white drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]"
                  />
                </div>

                <h2 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
                  {scene.title}
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-ink-dim sm:text-xl">
                  {scene.sub}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* progress bars */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-6 pb-11">
            <div className="flex gap-2">
              {SCENES.map((_, idx) => (
                <div
                  key={idx}
                  className="h-1 w-9 overflow-hidden rounded-full bg-white/12"
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: "#2f80ff",
                      transformOrigin: "left",
                      willChange: "transform",
                    }}
                    initial={{ scaleX: idx < i ? 1 : 0 }}
                    animate={{ scaleX: idx <= i ? 1 : 0 }}
                    transition={{
                      duration: idx === i && !isLast ? SCENE_MS / 1000 : 0.25,
                      ease: "linear",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* enter button — only on the final scene (must watch through) */}
            <div className="h-12">
              <AnimatePresence>
                {isLast && (
                  <motion.button
                    key="enter"
                    onClick={enter}
                    initial={{ opacity: 0, scale: 0.85, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.15 }}
                    className="group inline-flex items-center gap-2 rounded-full bg-brand px-8 py-3 text-base font-bold text-white shadow-[0_12px_30px_-8px_rgba(47,128,255,0.7)] transition-colors hover:bg-brand-light"
                  >
                    Enter Season 2
                    <ArrowRight
                      size={18}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
    </motion.div>
  );
}
