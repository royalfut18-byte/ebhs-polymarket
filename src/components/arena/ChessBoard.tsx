"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps, type FC } from "react";
import dynamic from "next/dynamic";
import { Chess, type Square } from "chess.js";

// react-chessboard ships crisp SVG pieces (chess.com / lichess quality) and
// handles drag-and-drop + the promotion dialog. We load it client-only to avoid
// any SSR window access, and keep chess.js as the single source of legality.
type ChessboardProps = ComponentProps<typeof import("react-chessboard")["Chessboard"]>;
const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
}) as FC<ChessboardProps>;

export interface BoardMove {
  from: string;
  to: string;
  promotion?: string;
}

type SquareStyles = Record<string, Record<string, string | number>>;

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  // Size the board to its container (capped), responsively.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w) setWidth(Math.min(480, Math.floor(w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);
  const turn = chess.turn(); // 'w' | 'b'

  const [moveFrom, setMoveFrom] = useState<string>("");
  const [optionSquares, setOptionSquares] = useState<SquareStyles>({});

  // Clear any in-progress selection when the position or our turn changes.
  useEffect(() => {
    setMoveFrom("");
    setOptionSquares({});
  }, [fen, canMove]);

  function legalFrom(sq: string) {
    try {
      return chess.moves({ square: sq as Square, verbose: true });
    } catch {
      return [];
    }
  }

  function optionStyles(sq: string): SquareStyles {
    const moves = legalFrom(sq);
    if (moves.length === 0) return {};
    const styles: SquareStyles = {};
    for (const m of moves) {
      const capture = !!chess.get(m.to as Square);
      styles[m.to] = {
        background: capture
          ? "radial-gradient(circle, rgba(0,0,0,0.3) 82%, transparent 82%)"
          : "radial-gradient(circle, rgba(0,0,0,0.3) 24%, transparent 24%)",
        borderRadius: "50%",
      };
    }
    styles[sq] = { background: "rgba(255, 241, 120, 0.55)" };
    return styles;
  }

  function commit(from: string, to: string, promotion?: string): boolean {
    const game = new Chess(fen);
    let res;
    try {
      res = game.move({ from, to, promotion: promotion ?? "q" });
    } catch {
      return false;
    }
    if (!res) return false;
    onMove({ from, to, promotion: res.promotion });
    return true;
  }

  function handleSquareClick(square: string) {
    if (!canMove) return;
    if (!moveFrom) {
      const piece = chess.get(square as Square);
      if (piece && piece.color === turn) {
        setMoveFrom(square);
        setOptionSquares(optionStyles(square));
      }
      return;
    }
    if (square === moveFrom) {
      setMoveFrom("");
      setOptionSquares({});
      return;
    }
    const isTarget = legalFrom(moveFrom).some((m) => m.to === square);
    if (isTarget) {
      commit(moveFrom, square); // click promotions auto-queen; drag offers the dialog
      setMoveFrom("");
      setOptionSquares({});
      return;
    }
    const piece = chess.get(square as Square);
    if (piece && piece.color === turn) {
      setMoveFrom(square);
      setOptionSquares(optionStyles(square));
    } else {
      setMoveFrom("");
      setOptionSquares({});
    }
  }

  function handleDrop(from: string, to: string): boolean {
    if (!canMove) return false;
    return commit(from, to);
  }

  function handlePromotion(piece?: string, from?: string, to?: string): boolean {
    if (!piece || !from || !to) return false;
    return commit(from, to, piece[1].toLowerCase()); // e.g. "wQ" -> "q"
  }

  const squareStyles = useMemo<SquareStyles>(() => {
    const s: SquareStyles = {};
    if (lastMove) {
      s[lastMove.from] = { background: "rgba(255, 213, 79, 0.45)" };
      s[lastMove.to] = { background: "rgba(255, 213, 79, 0.45)" };
    }
    if (chess.inCheck()) {
      for (const row of chess.board()) {
        for (const p of row) {
          if (p && p.type === "k" && p.color === turn) {
            s[p.square] = { background: "radial-gradient(circle, rgba(220,60,60,0.9) 36%, transparent 75%)" };
          }
        }
      }
    }
    return { ...s, ...optionSquares };
  }, [chess, lastMove, optionSquares, turn]);

  return (
    <div ref={wrapRef} className="mx-auto w-full max-w-[480px]">
      <Chessboard
        id="arena-chess"
        position={fen}
        boardWidth={width}
        boardOrientation={orientation}
        arePiecesDraggable={canMove}
        onPieceDrop={handleDrop}
        onSquareClick={handleSquareClick}
        onPromotionPieceSelect={handlePromotion}
        customSquareStyles={squareStyles}
        customBoardStyle={{ borderRadius: "12px", boxShadow: "0 12px 34px rgba(0,0,0,0.4)" }}
        customDarkSquareStyle={{ backgroundColor: "#769656" }}
        customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
      />
    </div>
  );
}
