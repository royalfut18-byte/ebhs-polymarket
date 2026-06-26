"use client";

import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { GAMES } from "@/lib/casino/games";
import { getSupabase } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { FadeIn, Stagger, StaggerItem, motion } from "@/components/motion";
import GameIcon from "./GameIcon";

export default function CasinoHome() {
  const { data: wagers = {} } = useQuery({
    queryKey: ["casino-wagers"],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("casino_wagers");
      if (error) throw error;
      return (data ?? {}) as Record<string, number>;
    },
    refetchInterval: 15000,
  });

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <section className="relative overflow-hidden rounded-3xl border border-white/10 p-7 sm:p-11">
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
              Nine classic games, all on the house&apos;s fake credits. Server-decided odds, instant
              payouts, and every win climbs the leaderboard. Zero real money.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-ink-dim">
              <Chip icon={<Zap size={13} className="text-amber-300" />}>Instant payouts</Chip>
              <Chip>Provably server-side</Chip>
              <Chip>9 games</Chip>
            </div>
          </div>
        </section>
      </FadeIn>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-black tracking-tight">
          <span className="text-amber-300">★</span> EBHS Originals
        </h2>
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {GAMES.map((g) => {
            const total = Number(wagers[g.slug] ?? 0);
            return (
              <StaggerItem key={g.slug}>
                <Link href={`/casino/${g.slug}`} className="group block">
                  {/* portrait thumbnail */}
                  <div
                    className="relative overflow-hidden rounded-2xl shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-1.5"
                    style={{ aspectRatio: "3 / 4", background: `linear-gradient(150deg, ${g.c1}, ${g.c2})` }}
                  >
                    {/* top sheen + bottom shade for legibility */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-60" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
                    {/* soft glow blob */}
                    <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/20 blur-2xl" />
                    {/* big medallion icon */}
                    <div className="absolute left-1/2 top-[36%] -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 group-hover:scale-110">
                      <GameIcon game={g.slug} size={66} />
                    </div>
                    {/* name */}
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/55">EBHS Originals</div>
                      <div className="text-base font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] sm:text-lg">
                        {g.name}
                      </div>
                    </div>
                  </div>
                  {/* live wager stat */}
                  <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    <span className="truncate text-xs font-semibold tabular-nums text-ink-dim">
                      {formatMoney(total)} <span className="text-ink-faint">wagered</span>
                    </span>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>

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
