import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import ConfigBanner from "@/components/ConfigBanner";

export const metadata: Metadata = {
  title: "EBHS Polymarket — Play-Money Prediction Markets",
  description:
    "A play-money prediction market for EBHS. Bet fake credits on YES/NO questions. No real money, ever.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Suspense fallback={<div className="h-16 border-b border-border bg-bg" />}>
              <Navbar />
            </Suspense>
            <ConfigBanner />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
            <footer className="border-t border-border px-4 py-6 text-center text-xs text-ink-faint">
              EBHS Polymarket · Play money only — no real currency, crypto, or wallets. Built for fun.
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
