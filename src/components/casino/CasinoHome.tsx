"use client";

import Link from "next/link";
import { Dice5, Sparkles } from "lucide-react";
import { GAMES } from "@/lib/casino/games";
import { FadeIn, Stagger, StaggerItem, motion } from "@/components/motion";

export default function CasinoHome() {
  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-rose-500/[0.12] via-white/[0.02] to-transparent p-7 sm:p-10">
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 animate-float rounded-full bg-rose-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 top-6 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-xs font-medium text-ink-dim">
              <Sparkles size={13} className="text-rose-300" /> Play-money casino
            </span>
            <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              <Dice5 className="text-rose-400" size={42} /> EBHS Casino
            </h1>
            <p className="mt-3 max-w-lg text-sm text-ink-dim sm:text-base">
              Nine classic games, all on the house&apos;s fake credits. Provably server-decided
              odds, instant payouts, zero real money. Good luck. 🍀
            </p>
          </div>
        </section>
      </FadeIn>

      <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {GAMES.map((g) => (
          <StaggerItem key={g.slug}>
            <Link href={`/casino/${g.slug}`}>
              <motion.div
                whileHover={{ y: -5 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className={`group card card-hover relative flex h-full flex-col gap-2 overflow-hidden bg-gradient-to-br ${g.accent} p-5`}
              >
                <div
                  className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: g.glow }}
                />
                <div className="text-4xl sm:text-5xl">{g.emoji}</div>
                <div className="mt-1 text-lg font-bold tracking-tight">{g.name}</div>
                <div className="text-xs text-ink-dim sm:text-sm">{g.blurb}</div>
              </motion.div>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      <p className="text-center text-xs text-ink-faint">
        🎲 All games use fake play credits only. No real money, crypto or wallets — just for fun.
      </p>
    </div>
  );
}
