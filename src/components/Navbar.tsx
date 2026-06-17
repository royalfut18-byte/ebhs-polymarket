"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Coins,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Search,
  Shield,
  Trophy,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { formatMoney } from "@/lib/format";
import Avatar from "./Avatar";
import Logo from "./Logo";
import NavPortfolio from "./NavPortfolio";

export default function Navbar() {
  const { profile, isStaff, loading, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  // Debounced search -> navigates home with ?q=
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (q === current) return;
      router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Logo />

        {/* Search */}
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
          }}
        >
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search markets"
            className="input pl-9"
            aria-label="Search markets"
          />
        </form>

        {/* Right side */}
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/leaderboard"
            className="hidden items-center gap-1.5 text-sm font-medium text-ink-dim hover:text-ink md:flex"
          >
            <Trophy size={16} /> Leaderboard
          </Link>

          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-xl bg-bg-hover" />
          ) : profile ? (
            <>
              <NavPortfolio />

              <div className="hidden items-center gap-1.5 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.07] px-3 py-1.5 text-sm shadow-[0_0_18px_-8px_rgba(250,204,21,0.6)] sm:flex">
                <Coins size={15} className="text-yellow-300" />
                <span className="font-semibold text-ink">{formatMoney(profile.balance)}</span>
                <span className="text-[10px] uppercase tracking-wide text-ink-faint">cash</span>
              </div>

              {isStaff && (
                <Link
                  href="/admin"
                  className="hidden items-center gap-1.5 rounded-xl border border-brand/40 bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/20 sm:flex"
                >
                  <Shield size={15} /> Admin
                </Link>
              )}

              {/* Avatar menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center rounded-full ring-2 ring-transparent transition hover:ring-border"
                  aria-label="Account menu"
                >
                  <Avatar name={profile.username} size={36} />
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
                      <div className="border-b border-border px-4 py-3">
                        <div className="truncate text-sm font-semibold text-ink">
                          @{profile.username}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-sm sm:hidden">
                          <Coins size={14} className="text-yellow-400" />
                          <span className="font-semibold">{formatMoney(profile.balance)}</span>
                        </div>
                      </div>
                      <MenuItem href="/portfolio" icon={<Wallet size={16} />} onClick={() => setMenuOpen(false)}>
                        Portfolio
                      </MenuItem>
                      <MenuItem href="/leaderboard" icon={<Trophy size={16} />} onClick={() => setMenuOpen(false)}>
                        Leaderboard
                      </MenuItem>
                      <MenuItem href="/suggest" icon={<Lightbulb size={16} />} onClick={() => setMenuOpen(false)}>
                        Suggest a market
                      </MenuItem>
                      {isStaff && (
                        <MenuItem href="/admin" icon={<LayoutDashboard size={16} />} onClick={() => setMenuOpen(false)}>
                          Admin panel
                        </MenuItem>
                      )}
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          signOut();
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-no-text hover:bg-bg-hover"
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary hidden sm:inline-flex">
                <UserIcon size={15} /> Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function MenuItem({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-bg-hover"
    >
      {icon}
      {children}
    </Link>
  );
}
