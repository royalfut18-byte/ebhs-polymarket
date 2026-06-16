import Link from "next/link";
import { TrendingUp } from "lucide-react";

export default function Logo() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-[0_6px_20px_-6px_rgba(91,124,250,0.8)] transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
        <TrendingUp size={18} strokeWidth={2.8} />
      </span>
      <span className="hidden text-[17px] font-bold tracking-tight sm:block">
        EBHS <span className="text-gradient">Polymarket</span>
      </span>
    </Link>
  );
}
