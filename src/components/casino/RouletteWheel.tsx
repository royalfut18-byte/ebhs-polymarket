"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

// Authentic European single-zero pocket order.
const ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31,
  9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const N = ORDER.length;
const STEP = 360 / N;
const R = 96;
const CX = 100;
const CY = 100;

// Round to fixed precision so the server and client render byte-identical SVG
// paths (avoids React hydration mismatches from 1-ULP float differences).
const rnd = (n: number) => Math.round(n * 1000) / 1000;

function slice(i: number, r = R) {
  const a0 = ((i * STEP - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * STEP - 90) * Math.PI) / 180;
  return `M${CX},${CY} L${rnd(CX + r * Math.cos(a0))},${rnd(CY + r * Math.sin(a0))} A${r},${r} 0 0,1 ${rnd(
    CX + r * Math.cos(a1)
  )},${rnd(CY + r * Math.sin(a1))} Z`;
}
function labelPos(i: number, r = 80) {
  const a = (((i + 0.5) * STEP - 90) * Math.PI) / 180;
  return { x: rnd(CX + r * Math.cos(a)), y: rnd(CY + r * Math.sin(a)) };
}
function fill(n: number) {
  if (n === 0) return "#16a34a";
  return RED.has(n) ? "#dc2626" : "#1a1a22";
}

// A spinning roulette wheel. Pass `result` (0-36) and bump `nonce` each spin to
// animate the wheel so the winning pocket lands under the top pointer.
export default function RouletteWheel({ result, nonce }: { result: number | null; nonce: number }) {
  const [rotation, setRotation] = useState(0);
  const rotRef = useRef(0);

  useEffect(() => {
    if (result === null) return;
    const idx = ORDER.indexOf(result);
    if (idx < 0) return;
    const center = idx * STEP + STEP / 2; // clockwise from top
    const targetMod = (360 - center) % 360;
    const base = rotRef.current + 360 * 5;
    const next = base + (((targetMod - (base % 360)) % 360) + 360) % 360;
    rotRef.current = next;
    setRotation(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  return (
    <div className="relative mx-auto h-[230px] w-[230px]">
      {/* pointer */}
      <div className="absolute left-1/2 top-[-2px] z-20 -translate-x-1/2">
        <div className="h-0 w-0 border-x-[9px] border-t-[15px] border-x-transparent border-t-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]" />
      </div>
      <motion.svg
        viewBox="0 0 200 200"
        className="h-full w-full drop-shadow-[0_14px_40px_rgba(0,0,0,0.55)]"
        animate={{ rotate: rotation }}
        transition={{ duration: 4.2, ease: [0.18, 0.9, 0.2, 1] }}
      >
        <circle cx={CX} cy={CY} r="99" fill="#0b0b12" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
        {ORDER.map((n, i) => {
          const { x, y } = labelPos(i);
          return (
            <g key={i}>
              <path d={slice(i)} fill={fill(n)} stroke="#08080d" strokeWidth="0.6" />
              <text
                x={x}
                y={y}
                fill="#fff"
                fontSize="7.5"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${i * STEP + STEP / 2}, ${x}, ${y})`}
              >
                {n}
              </text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r="34" fill="#13131d" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
        <circle cx={CX} cy={CY} r="12" fill="#23232e" stroke="rgba(255,255,255,0.2)" />
      </motion.svg>
    </div>
  );
}
