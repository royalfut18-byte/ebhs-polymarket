"use client";

import { colorFromString, initials } from "@/lib/format";

export default function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: colorFromString(name || "?"),
        fontSize: Math.round(size * 0.4),
      }}
      aria-hidden
    >
      {initials(name || "?")}
    </div>
  );
}
