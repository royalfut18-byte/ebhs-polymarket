"use client";

import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";
import { GAMES } from "@/lib/casino/games";
import { FadeIn, Stagger, StaggerItem, motion } from "@/components/motion";
import GameIcon from "./GameIcon";

export default function CasinoHome() {
  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <section className="relative overflow-hidden rounded-3xl border border-white/10 p-7 sm:p-11">
          {/* layered animated background */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70rem_40rem_at_15%_-20%,rgba(244,63,94,0.20),transparent_60%),radial-gradient(50rem_40rem_at_100%_120%,rgba(168,85,247,0.18),transparent_55%)]" />
          <motion.div
            className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rose-500/25 blur-3xl"
            animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute right-0 top-10 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl"
            animate={{ x: [0, -24, 0], y: [0, 24, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-ink-dim backdrop-blur">
              <Sparkles size={13} className="text-rose-300" /> Play-money casino
            </span>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              EBHS{" "}
              <span className="bg-gradient-to-r from-rose-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
                Casino
              </span>
            </h1>
            <p className="mt-3 max-w-lg text-sm text-ink-dim sm:text-base">
              Ten classic games, all on the house&apos;s fake credits. Server-decided odds, instant
              payouts, and every win climbs the leaderboard. Zero real money.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-ink-dim">
              <Chip icon={<Zap size={13} className="text-amber-300" />}>Instant payouts</Chip>
              <Chip>Provably server-side</Chip>
              <Chip>10 games</Chip>
            </div>
          </div>
        </section>
      </FadeIn>

      <Stagger className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4">
        {GAMES.map((g) => (
          <StaggerItem key={g.slug}>
            <Link href={`/casino/${g.slug}`} className="group block h-full">
              {/* gradient border wrapper */}
              <div
                className="relative h-full rounded-3xl p-px transition-all duration-300"
                style={{ background: `linear-gradient(150deg, ${g.c1}55, transparent 45%)` }}
              >
                <motion.div
                  whileHover={{ y: -6 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className={`relative flex h-full flex-col gap-3 overflow-hidden rounded-[23px] border border-white/[0.06] bg-gradient-to-br ${g.accent} bg-bg-card/90 p-5`}
                >
                  <div
                    className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: g.glow }}
                  />
                  <motion.div
                    whileHover={{ rotate: -8, scale: 1.06 }}
                    transition={{ type: "spring", stiffness: 300, damping: 14 }}
                    className="relative w-fit"
                  >
                    <GameIcon game={g.slug} size={56} />
                  </motion.div>
                  <div className="relative">
                    <div className="text-lg font-bold tracking-tight">{g.name}</div>
                    <div className="mt-0.5 text-xs text-ink-dim sm:text-sm">{g.blurb}</div>
                  </div>
                  <div className="relative mt-auto flex items-center justify-between pt-1">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: `${g.c1}22`, color: g.c1 }}
                    >
                      {g.tag}
                    </span>
                    <span className="text-xs font-semibold text-ink-faint transition-colors group-hover:text-ink">
                      Play →
                    </span>
                  </div>
                </motion.div>
              </div>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      <p className="text-center text-xs text-ink-faint">
        All games use fake play credits only — no real money, crypto or wallets. Just for fun.
      </p>
    </div>
  );
}

function Chip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 backdrop-blur">
      {icon}
      {children}
    </span>
  );
}
