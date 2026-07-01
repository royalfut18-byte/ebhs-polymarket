"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const wordmark = "EB Poly";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
};
const letterV = {
  hidden: { y: 70, opacity: 0, rotateX: -90, filter: "blur(6px)" },
  show: {
    y: 0,
    opacity: 1,
    rotateX: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 220, damping: 16 },
  },
} as const;

// One-time Season 2 intro. Plays once per tab session, over everything.
export default function IntroSplash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("ebpoly_intro_s2") === "1") return;
    setShow(true);
    const t = setTimeout(dismiss, 3200);
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
          exit={{ opacity: 0, scale: 1.14, filter: "blur(12px)", transition: { duration: 0.7, ease: [0.7, 0, 0.3, 1] } }}
        >
          {/* subtle grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(47,128,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(47,128,255,0.4) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(circle at 50% 45%, black, transparent 70%)",
            }}
          />

          {/* glows */}
          <motion.div
            className="pointer-events-none absolute h-[42rem] w-[42rem] rounded-full bg-brand/25 blur-[120px]"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 1.1, 0.9], opacity: [0, 0.85, 0.5] }}
            transition={{ duration: 2.6, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute -bottom-40 right-10 h-[30rem] w-[30rem] rounded-full bg-cyan-500/20 blur-[120px]"
            animate={{ scale: [1, 1.35, 1], opacity: [0.25, 0.6, 0.25] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* expanding ring */}
          <motion.div
            className="pointer-events-none absolute rounded-full border border-brand/40"
            initial={{ width: 0, height: 0, opacity: 0.7 }}
            animate={{ width: 760, height: 760, opacity: 0 }}
            transition={{ duration: 2.1, ease: "easeOut", delay: 0.35 }}
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
                  className={
                    ch === " "
                      ? "inline-block w-4 sm:w-7"
                      : "inline-block bg-gradient-to-b from-white via-white to-brand-light bg-clip-text text-transparent drop-shadow-[0_0_34px_rgba(47,128,255,0.55)]"
                  }
                >
                  {ch === " " ? " " : ch}
                </motion.span>
              ))}
            </motion.div>

            <motion.div
              initial={{ scale: 0.3, opacity: 0, y: 22 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.85, type: "spring", stiffness: 200, damping: 13 }}
              className="relative mt-5 overflow-hidden rounded-full border border-brand/40 bg-brand/15 px-6 py-2 shadow-[0_0_30px_-6px_rgba(47,128,255,0.6)] backdrop-blur"
            >
              <span className="text-sm font-black uppercase tracking-[0.35em] text-brand-light sm:text-lg">
                Season&nbsp;2
              </span>
              {/* shine sweep across the badge */}
              <motion.div
                className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                initial={{ x: "-130%" }}
                animate={{ x: "130%" }}
                transition={{ delay: 1.4, duration: 0.9, ease: "easeInOut" }}
              />
            </motion.div>
          </div>

          {/* big light sweep over the whole lockup */}
          <motion.div
            className="pointer-events-none absolute h-56 w-28 rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent blur-2xl"
            initial={{ x: -460, opacity: 0 }}
            animate={{ x: 460, opacity: [0, 1, 0] }}
            transition={{ delay: 1.15, duration: 1.1, ease: "easeInOut" }}
          />

          <motion.div
            className="absolute bottom-10 text-xs font-medium uppercase tracking-[0.3em] text-ink-faint"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8] }}
            transition={{ delay: 1.8, duration: 0.6 }}
          >
            Tap to enter
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
