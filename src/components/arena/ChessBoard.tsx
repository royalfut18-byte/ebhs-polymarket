"use client";

import { useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import clsx from "clsx";

const GLYPH: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export interface BoardMove {
  from: string;
  to: string;
  promotion?: string;
}

// A click-to-move chess board. Legal moves, check, last-move and promotion are
// all computed locally with chess.js — the single source of truth for legality.
export default function ChessBoard({
  fen,
  orientation,
  canMove,
  lastMove,
  onMove,
}: {
  fen: string;
  orientation: "white" | "black";
  canMove: boolean;
  lastMove?: { from: string; to: string } | null;
  onMove: (m: BoardMove) => void;
}) {
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);

  const turn = chess.turn(); // 'w' | 'b'

  const legal = useMemo(() => {
    if (!selected) return [] as { to: string; promotion?: string }[];
    try {
      return chess
        .moves({ square: selected as Square, verbose: true })
        .map((m) => ({ to: m.to as string, promotion: m.promotion as string | undefined }));
    } catch {
      return [];
    }
  }, [chess, selected]);
  const targets = useMemo(() => new Set(legal.map((m) => m.to)), [legal]);

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (const row of chess.board()) {
      for (const sq of row) {
        if (sq && sq.type === "k" && sq.color === turn) return sq.square as string;
      }
    }
    return null;
  }, [chess, turn]);

  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "white" ? FILES : [...FILES].reverse();

  function clickSquare(sq: string) {
    if (!canMove || promo) return;
    const piece = chess.get(sq as Square);

    if (selected) {
      if (sq === selected) {
        setSelected(null);
        return;
      }
      if (targets.has(sq)) {
        const needsPromo = legal.some((m) => m.to === sq && m.promotion);
        if (needsPromo) {
          setPromo({ from: selected, to: sq });
        } else {
          onMove({ from: selected, to: sq });
          setSelected(null);
        }
        return;
      }
      if (piece && piece.color === turn) {
        setSelected(sq);
        return;
      }
      setSelected(null);
      return;
    }

    if (piece && piece.color === turn) setSelected(sq);
  }

  return (
    <div className="relative mx-auto w-full max-w-[480px]">
      <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-xl ring-1 ring-white/10">
        {ranks.map((rank) =>
          files.map((file) => {
            const sq = `${file}${rank}`;
            const piece = chess.get(sq as Square);
            const dark = (FILES.indexOf(file) + rank) % 2 === 0;
            const isSel = selected === sq;
            const isTarget = targets.has(sq);
            const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
            const isCheck = checkSquare === sq;
            return (
              <button
                key={sq}
                onClick={() => clickSquare(sq)}
                className={clsx(
                  "relative flex items-center justify-center leading-none transition-colors",
                  dark ? "bg-[#5c7a52]" : "bg-[#cdd3b4]",
                  isSel && "!bg-[#b9c45e]",
                  isLast && !isSel && "!bg-[#9bad5a]",
                  isCheck && "!bg-[#d06464]"
                )}
                style={{ cursor: canMove && (piece?.color === turn || isTarget) ? "pointer" : "default" }}
              >
                {piece && (
                  <span
                    className="select-none text-3xl drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] sm:text-[2.6rem]"
                    style={{
                      color: piece.color === "w" ? "#fefefe" : "#16161c",
                      textShadow: piece.color === "w" ? "0 0 1px #555, 0 1px 1px rgba(0,0,0,.4)" : undefined,
                    }}
                  >
                    {GLYPH[piece.type]}
                  </span>
                )}
                {isTarget && !piece && (
                  <span className="absolute h-1/4 w-1/4 rounded-full bg-black/25" />
                )}
                {isTarget && piece && (
                  <span className="absolute inset-1 rounded-full ring-4 ring-black/25" />
                )}
              </button>
            );
          })
        )}
      </div>

      {promo && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <div className="flex gap-2 rounded-2xl border border-border bg-bg-card p-3">
            {(["q", "r", "b", "n"] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  onMove({ from: promo.from, to: promo.to, promotion: p });
                  setPromo(null);
                  setSelected(null);
                }}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-soft text-3xl hover:bg-bg-hover"
                style={{ color: turn === "w" ? "#fefefe" : "#16161c" }}
              >
                {GLYPH[p]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
