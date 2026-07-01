"use client";

import type { CasinoGame } from "@/lib/types";

// Stake-style game illustrations for the casino thumbnails. Each is a clean,
// bold vector scene drawn full-bleed on the card's gradient. Solid fills +
// opacity overlays only (no gradient ids) so nothing collides across the grid.
const SH = { filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.28))" } as const;
const gloss = "rgba(255,255,255,0.85)";

function Dice() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <g style={SH} transform="translate(50 24) rotate(14)">
        <rect width="34" height="34" rx="8" fill="#f5f3ff" />
        <rect width="34" height="13" rx="8" fill={gloss} opacity="0.5" />
        <circle cx="11" cy="11" r="3.6" fill="#7c3aed" />
        <circle cx="23" cy="23" r="3.6" fill="#7c3aed" />
      </g>
      <g style={SH} transform="translate(16 42) rotate(-9)">
        <rect width="42" height="42" rx="10" fill="#fff" />
        <rect width="42" height="16" rx="10" fill={gloss} opacity="0.5" />
        <circle cx="12" cy="12" r="4.2" fill="#6d28d9" />
        <circle cx="30" cy="12" r="4.2" fill="#6d28d9" />
        <circle cx="21" cy="21" r="4.2" fill="#6d28d9" />
        <circle cx="12" cy="30" r="4.2" fill="#6d28d9" />
        <circle cx="30" cy="30" r="4.2" fill="#6d28d9" />
      </g>
    </svg>
  );
}

function Mines() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {/* bomb */}
      <g style={SH} transform="translate(20 40)">
        <circle cx="16" cy="20" r="16" fill="#1f2937" />
        <circle cx="11" cy="15" r="5" fill="#4b5563" opacity="0.9" />
        <rect x="13" y="-2" width="6" height="8" rx="2" fill="#374151" />
        <path d="M19 1 q7 -6 12 -2" stroke="#f59e0b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="32" cy="-2" r="2.6" fill="#fbbf24" />
      </g>
      {/* gem */}
      <g style={SH} transform="translate(46 22)">
        <path d="M16 0 L31 11 L16 34 L1 11 Z" fill="#34d399" />
        <path d="M16 0 L31 11 L16 16 Z" fill="#a7f3d0" />
        <path d="M1 11 L16 16 L16 34 Z" fill="#059669" />
        <path d="M16 0 L8 11 L16 16 Z" fill="#6ee7b7" />
      </g>
    </svg>
  );
}

function Plinko() {
  const pegs = [
    [50, 18],
    [38, 32], [62, 32],
    [26, 46], [50, 46], [74, 46],
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {pegs.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#fff" opacity="0.85" />
      ))}
      <g style={SH} transform="translate(38 56)">
        <circle cx="12" cy="12" r="15" fill="#fbbf24" />
        <circle cx="12" cy="12" r="15" fill="none" stroke="#f59e0b" strokeWidth="3" />
        <circle cx="7" cy="7" r="4" fill={gloss} opacity="0.6" />
        <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="900" fill="#b45309">$</text>
      </g>
    </svg>
  );
}

function Crash() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <path d="M10 80 Q44 78 62 40 T90 14" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 7" />
      <circle cx="22" cy="22" r="1.8" fill="#fff" opacity="0.8" />
      <circle cx="74" cy="64" r="1.6" fill="#fff" opacity="0.7" />
      <g style={SH} transform="translate(60 6) rotate(45)">
        <path d="M12 0 C20 6 20 20 12 30 C4 20 4 6 12 0 Z" fill="#fff" />
        <circle cx="12" cy="12" r="4.5" fill="#3b82f6" />
        <path d="M5 24 L1 33 L9 28 Z" fill="#f97316" />
        <path d="M19 24 L23 33 L15 28 Z" fill="#f97316" />
        <path d="M12 30 L8 40 L12 36 L16 40 Z" fill="#fbbf24" />
      </g>
    </svg>
  );
}

function Limbo() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <path d="M50 78 L50 30" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 6" />
      <path d="M50 22 l-10 14 h6 v8 h8 v-8 h6 Z" fill="#fff" opacity="0.85" />
      <g style={SH} transform="translate(20 44)">
        <rect width="60" height="30" rx="9" fill="#fff" />
        <text x="30" y="21" textAnchor="middle" fontSize="18" fontWeight="900" fill="#7c3aed">100×</text>
      </g>
    </svg>
  );
}

function Card({ x, y, rot, fill, label, sub }: { x: number; y: number; rot: number; fill: string; label: string; sub?: string }) {
  return (
    <g style={SH} transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect width="32" height="44" rx="5" fill="#fff" />
      <text x="6" y="15" fontSize="12" fontWeight="900" fill={fill}>{label}</text>
      {sub && <text x="16" y="32" textAnchor="middle" fontSize="16" fill={fill}>{sub}</text>}
    </g>
  );
}

function HiLo() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <Card x={14} y={32} rot={-10} fill="#16a34a" label="K" sub="♠" />
      <Card x={50} y={28} rot={9} fill="#dc2626" label="7" sub="♥" />
      <g transform="translate(40 14)">
        <path d="M10 0 l6 8 h-12 Z" fill="#fff" />
      </g>
      <g transform="translate(40 82)">
        <path d="M10 10 l6 -8 h-12 Z" fill="#fff" opacity="0.8" />
      </g>
    </svg>
  );
}

function Blackjack() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <Card x={20} y={34} rot={-12} fill="#1e293b" label="A" sub="♠" />
      <Card x={48} y={30} rot={10} fill="#dc2626" label="K" sub="♥" />
      <g style={SH} transform="translate(34 60)">
        <rect width="32" height="20" rx="6" fill="#0f172a" />
        <text x="16" y="15" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fbbf24">21</text>
      </g>
    </svg>
  );
}

function Roulette() {
  const seg = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <g style={SH} transform="translate(50 50)">
        <circle r="33" fill="#fff" />
        <circle r="30" fill="#7f1d1d" />
        {seg.map((i) => {
          const a0 = (i / 12) * Math.PI * 2;
          const a1 = ((i + 1) / 12) * Math.PI * 2;
          const r = 30;
          const x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r;
          const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
          return <path key={i} d={`M0 0 L${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`} fill={i % 2 ? "#111827" : "#dc2626"} />;
        })}
        <circle r="13" fill="#fff" />
        <circle r="13" fill="none" stroke="#e5e7eb" strokeWidth="2" />
        <circle r="5" fill="#facc15" />
        <circle cx="0" cy="-24" r="3.5" fill="#fff" />
      </g>
    </svg>
  );
}

function Baccarat() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <g style={SH} transform="translate(50 22)">
        <path d="M-16 8 L-10 -6 L-3 4 L0 -10 L3 4 L10 -6 L16 8 Z" fill="#fff" />
        <rect x="-16" y="7" width="32" height="5" rx="2" fill="#f1f5f9" />
        <circle cx="-10" cy="-6" r="2.4" fill="#f59e0b" />
        <circle cx="0" cy="-10" r="2.4" fill="#f59e0b" />
        <circle cx="10" cy="-6" r="2.4" fill="#f59e0b" />
      </g>
      <Card x={18} y={44} rot={-9} fill="#dc2626" label="9" sub="♦" />
      <Card x={50} y={44} rot={9} fill="#0f172a" label="A" sub="♣" />
    </svg>
  );
}

function Flappy() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {/* pipes */}
      <g style={SH}>
        <rect x="72" y="2" width="20" height="30" rx="2" fill="#2f8f2b" />
        <rect x="69" y="30" width="26" height="8" rx="2" fill="#43b53d" />
        <rect x="72" y="66" width="20" height="34" rx="2" fill="#2f8f2b" />
        <rect x="69" y="58" width="26" height="8" rx="2" fill="#43b53d" />
      </g>
      {/* clouds */}
      <circle cx="18" cy="16" r="7" fill="#fff" opacity="0.7" />
      <circle cx="27" cy="18" r="6" fill="#fff" opacity="0.7" />
      {/* bird */}
      <g style={SH} transform="translate(30 52) rotate(-10)">
        <ellipse cx="0" cy="0" rx="20" ry="17" fill="#fde047" />
        <path d="M-4 6 a14 8 0 0 0 20 0 a14 10 0 0 1 -20 0 Z" fill="#fbbf24" />
        <path d="M-6 -2 q-12 -5 -18 3 q9 5 18 2 Z" fill="#fff" />
        <circle cx="9" cy="-6" r="6.5" fill="#fff" />
        <circle cx="11" cy="-6" r="3" fill="#111" />
        <path d="M18 -1 l13 3 l-13 5 Z" fill="#ff8a2a" />
      </g>
    </svg>
  );
}

const ART: Record<CasinoGame, () => React.ReactElement> = {
  dice: Dice,
  mines: Mines,
  plinko: Plinko,
  crash: Crash,
  limbo: Limbo,
  hilo: HiLo,
  blackjack: Blackjack,
  roulette: Roulette,
  baccarat: Baccarat,
  flappy: Flappy,
};

export default function GameArt({ game }: { game: CasinoGame }) {
  const Art = ART[game];
  if (!Art) return null;
  return <Art />;
}
