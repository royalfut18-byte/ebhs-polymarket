"use client";

import clsx from "clsx";
import { Ban, RefreshCw } from "lucide-react";
import type { UnoCard as Card, UnoColor, UnoValue } from "@/lib/arena/types";

// Solid, crisp Uno cards built from divs/SVG icons (not blurry glyphs). The four
// colours plus black wilds; numbers and skip/reverse/+2/wild symbols.
const FACE: Record<Exclude<UnoColor, "w">, { bg: string; ring: string }> = {
  r: { bg: "#e3342f", ring: "#b51d18" },
  y: { bg: "#f4c20d", ring: "#c79a05" },
  g: { bg: "#2faa4a", ring: "#1f7d35" },
  b: { bg: "#3066d6", ring: "#1f49a8" },
};

export function valueLabel(v: UnoValue): string {
  if (v === "skip") return "Skip";
  if (v === "rev") return "Reverse";
  if (v === "draw2") return "+2";
  if (v === "wild") return "Wild";
  if (v === "wild4") return "+4";
  return v;
}

export const COLOR_NAME: Record<UnoColor, string> = {
  r: "Red",
  y: "Yellow",
  g: "Green",
  b: "Blue",
  w: "Wild",
};

function Glyph({ v, size }: { v: UnoValue; size: number }) {
  if (v === "skip") return <Ban size={size} strokeWidth={2.6} />;
  if (v === "rev") return <RefreshCw size={size} strokeWidth={2.6} />;
  if (v === "draw2") return <span className="font-black leading-none">+2</span>;
  if (v === "wild4") return <span className="font-black leading-none">+4</span>;
  if (v === "wild") return null;
  return <span className="font-black leading-none">{v}</span>;
}

// Short corner index so a card stays readable when fanned/overlapped (only its
// top-left corner shows).
function cornerLabel(v: UnoValue): string {
  if (v === "skip") return "Ø";
  if (v === "rev") return "⇄";
  if (v === "draw2") return "+2";
  if (v === "wild") return "★";
  if (v === "wild4") return "+4";
  return v;
}

export default function UnoCard({
  card,
  size = 64,
  selectable = false,
  glow = false,
  onClick,
  className,
}: {
  card: Card;
  size?: number;
  selectable?: boolean;
  glow?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const h = size;
  const w = Math.round(size * 0.68);
  const isWild = card.c === "w";
  const face = isWild ? null : FACE[card.c as Exclude<UnoColor, "w">];
  const fontSize = Math.round(size * 0.34);

  const inner = (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-[14%]"
      style={{
        width: w,
        height: h,
        background: isWild ? "#15151c" : face!.bg,
        boxShadow: `inset 0 0 0 ${Math.max(2, size * 0.05)}px #fff, 0 4px 10px -3px rgba(0,0,0,0.5)`,
      }}
    >
      {/* the white oval Uno signature */}
      <div
        className="absolute rounded-[50%]"
        style={{
          width: w * 1.25,
          height: h * 0.62,
          transform: "rotate(-32deg)",
          background: isWild ? "transparent" : "rgba(255,255,255,0.92)",
        }}
      />
      {isWild ? (
        // four-colour pinwheel for wild cards
        <div
          className="absolute rounded-[50%]"
          style={{
            width: w * 0.74,
            height: w * 0.74,
            background:
              "conic-gradient(#e3342f 0 90deg,#3066d6 90deg 180deg,#2faa4a 180deg 270deg,#f4c20d 270deg 360deg)",
          }}
        />
      ) : null}
      <span
        className="relative flex items-center justify-center"
        style={{ color: isWild ? "#fff" : face!.ring, fontSize, lineHeight: 1 }}
      >
        <Glyph v={card.v} size={Math.round(size * 0.34)} />
      </span>
      {/* corner indices — stay visible when cards overlap in the hand fan */}
      <span
        className="absolute left-[7%] top-[3%] font-black leading-none text-white"
        style={{ fontSize: Math.round(size * 0.2), textShadow: "0 0 2px rgba(0,0,0,0.95), 0 1px 1px rgba(0,0,0,0.95)" }}
      >
        {cornerLabel(card.v)}
      </span>
      <span
        className="absolute bottom-[3%] right-[7%] rotate-180 font-black leading-none text-white"
        style={{ fontSize: Math.round(size * 0.2), textShadow: "0 0 2px rgba(0,0,0,0.95), 0 1px 1px rgba(0,0,0,0.95)" }}
      >
        {cornerLabel(card.v)}
      </span>
    </div>
  );

  if (!onClick) return <div className={className}>{inner}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!selectable}
      className={clsx(
        "shrink-0 rounded-[14%] transition-transform",
        selectable ? "cursor-pointer hover:-translate-y-2 focus:-translate-y-2" : "cursor-default",
        glow && "ring-[3px] ring-white drop-shadow-[0_0_14px_rgba(255,255,255,0.55)]",
        className
      )}
    >
      {inner}
    </button>
  );
}

// A face-down card back (for opponents' hands).
export function UnoCardBack({ size = 40 }: { size?: number }) {
  const h = size;
  const w = Math.round(size * 0.68);
  return (
    <div
      className="shrink-0 rounded-[14%]"
      style={{
        width: w,
        height: h,
        background: "linear-gradient(135deg,#1f1f2b,#0c0c12)",
        boxShadow: `inset 0 0 0 ${Math.max(2, size * 0.05)}px #fff, 0 3px 8px -3px rgba(0,0,0,0.6)`,
      }}
    >
      <div className="flex h-full w-full items-center justify-center">
        <span className="font-black italic text-rose-500" style={{ fontSize: Math.round(size * 0.26) }}>
          U
        </span>
      </div>
    </div>
  );
}
