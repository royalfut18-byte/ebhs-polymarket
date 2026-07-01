"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Flame, Gamepad2, Gift, LayoutGrid, Swords, Trophy } from "lucide-react";
import { GAMES } from "@/lib/casino/games";
import { getSupabase } from "@/lib/supabase/client";
import { fetchRecentActivity } from "@/lib/queries";
import { formatCompact, formatMoney } from "@/lib/format";
import type { CasinoGame } from "@/lib/types";
import { FadeIn } from "@/components/motion";
import GameIcon from "./GameIcon";
import GameArt from "./GameArt";
import clsx from "clsx";

// ---- left sidebar ----------------------------------------------------------
function Sidebar() {
  return (
    <aside className="hidden w-52 shrink-0 lg:block">
      <div className="sticky top-20 flex flex-col gap-4">
        <div className="flex rounded-xl bg-bg-soft p-1">
          <span className="flex-1 rounded-lg bg-brand py-1.5 text-center text-sm font-bold text-white">Casino</span>
          <Link href="/arena" className="flex-1 rounded-lg py-1.5 text-center text-sm font-bold text-ink-dim hover:text-ink">
            Sports
          </Link>
        </div>

        <div className="flex flex-col gap-0.5">
          <SideHead icon={<Gamepad2 size={15} />} label="Casino" />
          {GAMES.map((g) => (
            <Link
              key={g.slug}
              href={`/casino/${g.slug}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-dim transition-colors hover:bg-bg-hover hover:text-ink"
            >
              <GameIcon game={g.slug} size={20} />
              {g.name}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-0.5">
          <SideHead icon={<LayoutGrid size={15} />} label="More" />
          <SideLink href="/arena" icon={<Swords size={16} />} label="Arena" />
          <SideLink href="/leaderboard" icon={<Trophy size={16} />} label="Leaderboard" />
          <SideLink href="/portfolio#spin" icon={<Gift size={16} />} label="Daily Spin" />
        </div>
      </div>
    </aside>
  );
}
function SideHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-faint">
      {icon} {label}
    </div>
  );
}
function SideLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-dim transition-colors hover:bg-bg-hover hover:text-ink"
    >
      <span className="text-brand-light">{icon}</span> {label}
    </Link>
  );
}

// ---- promo banners ---------------------------------------------------------
const PROMOS = [
  { title: "Daily Spin", blurb: "Spin once a day for free credits", cta: "Spin now", href: "/portfolio#spin", icon: Gift, grad: "linear-gradient(135deg,#1d4ed8,#1e3a8a)" },
  { title: "Leaderboard", blurb: "Climb the ranks & win real prizes", cta: "View ranks", href: "/leaderboard", icon: Trophy, grad: "linear-gradient(135deg,#0ea5e9,#1e40af)" },
  { title: "The Arena", blurb: "1v1 wagered Chess, Pool & Uno", cta: "Play now", href: "/arena", icon: Swords, grad: "linear-gradient(135deg,#2563eb,#0f766e)" },
];
function Promos() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PROMOS.map((p) => (
        <Link
          key={p.title}
          href={p.href}
          className="group relative flex h-32 overflow-hidden rounded-2xl p-4 ring-1 ring-white/10 transition-transform duration-200 hover:-translate-y-0.5"
          style={{ background: p.grad }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-white/5" />
          <div className="relative flex flex-1 flex-col justify-between">
            <div>
              <div className="text-base font-black text-white drop-shadow">{p.title}</div>
              <div className="mt-1 max-w-[80%] text-[11px] leading-snug text-white/75">{p.blurb}</div>
            </div>
            <span className="inline-flex w-fit items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm transition-colors group-hover:bg-white/30">
              {p.cta} <ArrowRight size={12} />
            </span>
          </div>
          <p.icon className="relative ml-2 self-center text-white/85 drop-shadow-lg" size={52} strokeWidth={1.5} />
        </Link>
      ))}
    </div>
  );
}

// ---- recent wins -----------------------------------------------------------
function RecentWins() {
  const { data = [] } = useQuery({
    queryKey: ["casino-recent-wins"],
    queryFn: () => fetchRecentActivity(24),
    refetchInterval: 12000,
  });
  const wins = data.filter((a) => a.kind === "casino" && a.won && (a.payout ?? 0) > 0).slice(0, 12);
  if (wins.length === 0) return null;

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <h2 className="text-sm font-black tracking-tight">Recent Wins</h2>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {wins.map((w, i) => (
          <div key={i} className="flex w-[72px] shrink-0 flex-col items-center gap-1">
            <div className="rounded-xl ring-1 ring-white/10">
              <GameIcon game={(w.game as CasinoGame) ?? "dice"} size={62} className="!rounded-xl" />
            </div>
            <div className="w-full truncate text-center text-[11px] font-medium text-ink-dim">@{w.username}</div>
            <div className="text-[11px] font-black tabular-nums text-yes-text">+{formatMoney(w.payout ?? 0)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- originals grid --------------------------------------------------------
export default function CasinoHome() {
  const [tab, setTab] = useState<"lobby" | "originals">("lobby");
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
    <div className="flex gap-5">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <FadeIn>
          <Promos />
        </FadeIn>

        <RecentWins />

        {/* filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {(["lobby", "originals"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-bold capitalize transition-colors",
                tab === t ? "bg-brand text-white" : "bg-bg-soft text-ink-dim hover:text-ink"
              )}
            >
              {t === "lobby" ? "Lobby" : "EBHS Originals"}
            </button>
          ))}
        </div>

        {/* originals section */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-base font-black tracking-tight">
            <Flame size={17} className="text-orange-400" /> EBHS Originals
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {GAMES.map((g) => {
              const total = Number(wagers[g.slug] ?? 0);
              return (
                <Link key={g.slug} href={`/casino/${g.slug}`} className="group block">
                  <div
                    className="relative overflow-hidden rounded-2xl shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-1.5"
                    style={{ aspectRatio: "3 / 4", background: `linear-gradient(150deg, ${g.c1}, ${g.c2})` }}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-60" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
                    <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/20 blur-2xl" />

                    {/* live players badge (top-right) */}
                    <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {formatCompact(total)}
                    </div>

                    <div className="absolute inset-x-0 top-0 bottom-[24%] p-3.5 transition-transform duration-300 group-hover:scale-[1.07]">
                      <GameArt game={g.slug} />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/55">EBHS Originals</div>
                      <div className="text-base font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] sm:text-lg">
                        {g.name}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <p className="text-center text-xs text-ink-faint">
          All games use fake play credits only — no real money, crypto or wallets. Just for fun.
        </p>
      </div>
    </div>
  );
}
