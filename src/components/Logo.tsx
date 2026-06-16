import Link from "next/link";
import { TrendingUp } from "lucide-react";

export default function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
        <TrendingUp size={18} strokeWidth={2.6} />
      </span>
      <span className="hidden text-[17px] font-bold tracking-tight text-ink sm:block">
        EBHS <span className="text-brand">Polymarket</span>
      </span>
    </Link>
  );
}
