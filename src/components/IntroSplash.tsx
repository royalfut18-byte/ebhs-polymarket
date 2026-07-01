"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const wordmark = "EB Poly";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
};
const letterV = {
  hidden: { y: 60, opacity: 0, rotateX: -80 },
  show: {
    y: 0,
    opacity: 1,
    rotateX: 0,
    transition: { type: "spring", stiffness: 240, damping: 18 },
  },
} as const;

// One-time Season 2 intro. Plays once per tab session.
// Perf: transform + opacity only (composited) — no animated blur/width/height.
export default function IntroSplash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("ebpoly_intro_s2") === "1") return;
    setShow(true);
    const t = setTimeout(dismiss, 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    sessionStorage.setItem("ebpoly_intro_s2", "1");
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          onClick={dismiss}
          className="fixed inset-0 z-[9999] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#070f1e]"
          exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.6, ease: "easeInOut" } }}
        >
          {/* glow — radial gradient scaled via transform (no filter = smooth) */}
          <motion.div
            className="pointer-events-none absolute h-[36rem] w-[36rem] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(47,128,255,0.5), rgba(47,128,255,0) 65%)",
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 1 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />

          {/* expanding ring via scale (transform, not width/height) */}
          <motion.div
            className="pointer-events-none absolute h-64 w-64 rounded-full border border-brand/50"
            style={{ willChange: "transform, opacity" }}
            initial={{ scale: 0.2, opacity: 0.7 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1.8, ease: "easeOut", delay: 0.2 }}
          />

          {/* wordmark + badge */}
          <div className="relative flex flex-col items-center" style={{ perspective: 900 }}>
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="flex text-6xl font-black tracking-tight sm:text-8xl"
              style={{ transformStyle: "preserve-3d" }}
            >
              {wordmark.split("").map((ch, i) => (
                <motion.span
                  key={i}
                  variants={letterV}
                  style={{ willChange: "transform, opacity" }}
                  className={
                    ch === " "
                      ? "inline-block w-4 sm:w-7"
                      : "inline-block bg-gradient-to-b from-white to-brand-light bg-clip-text text-transparent"
                  }
                >
                  {ch === " " ? " " : ch}
                </motion.span>
              ))}
            </motion.div>

            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.7, type: "spring", stiffness: 220, damping: 15 }}
              className="relative mt-5 overflow-hidden rounded-full border border-brand/40 bg-brand/15 px-6 py-2"
            >
              <span className="text-sm font-black uppercase tracking-[0.35em] text-brand-light sm:text-lg">
                Season&nbsp;2
              </span>
              {/* shine sweep (transform x only) */}
              <motion.div
                className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                style={{ willChange: "transform" }}
                initial={{ x: "-140%" }}
                animate={{ x: "140%" }}
                transition={{ delay: 1.2, duration: 0.85, ease: "easeInOut" }}
              />
            </motion.div>
          </div>

          <motion.div
            className="absolute bottom-10 text-xs font-medium uppercase tracking-[0.3em] text-ink-faint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ delay: 1.6, duration: 0.5 }}
          >
            Tap to enter
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
