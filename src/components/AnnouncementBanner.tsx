"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";

const KEY = "ann-spin-wheel-v2";

export default function AnnouncementBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(localStorage.getItem(KEY) !== "1");
  }, []);

  if (!show) return null;

  return (
    <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl border border-accent-violet/30 bg-gradient-to-r from-accent-violet/20 via-brand/10 to-transparent p-4 pr-10">
      <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-accent-violet/20 blur-3xl" />
      <span className="relative animate-float text-3xl">🎡</span>
      <div className="relative min-w-0 flex-1">
        <div className="font-bold text-ink">The daily Spin to Win is here!</div>
        <div className="text-sm text-ink-dim">
          Spin once a day for a shot at $100, $50 or $25 in free credits.
        </div>
      </div>
      <Link href="/portfolio#spin" className="btn btn-primary relative shrink-0">
        Take me there <ArrowRight size={16} />
      </Link>
      <button
        onClick={() => {
          localStorage.setItem(KEY, "1");
          setShow(false);
        }}
        className="absolute right-2.5 top-2.5 text-ink-faint transition-colors hover:text-ink"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
