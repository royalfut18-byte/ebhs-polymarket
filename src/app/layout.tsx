import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import ConfigBanner from "@/components/ConfigBanner";
import SupportWidget from "@/components/SupportWidget";
import AppGate from "@/components/AppGate";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EBHS Polymarket — Predict & Win",
  description:
    "A play-money prediction market for EBHS. Bet fake credits on YES/NO questions and win prizes. No real money, ever.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Suspense fallback={<div className="h-16 border-b border-border" />}>
              <Navbar />
            </Suspense>
            <ConfigBanner />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
              <AppGate>{children}</AppGate>
            </main>
            <footer className="mt-10 border-t border-border px-4 py-8 text-center text-xs text-ink-faint">
              <span className="text-gradient font-semibold">EBHS Polymarket</span> · Play money only
              — no real currency, crypto, or wallets. Built for fun. 🎲
            </footer>
          </div>
          <SupportWidget />
        </Providers>
        <Analytics />
        {/* Third-party ad network (highperformanceformat) */}
        <Script id="ad-config" strategy="afterInteractive">
          {`
            atOptions = {
              'key' : 'c52a16f07ce586730d804ac8f6804a35',
              'format' : 'iframe',
              'height' : 600,
              'width' : 160,
              'params' : {}
            };
          `}
        </Script>
        <Script
          src="https://www.highperformanceformat.com/c52a16f07ce586730d804ac8f6804a35/invoke.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
