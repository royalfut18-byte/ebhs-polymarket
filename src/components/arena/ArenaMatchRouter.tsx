"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchMatch } from "@/lib/arena/queries";
import ChessMatch from "./ChessMatch";
import UnoTable from "./UnoTable";

// Loads the match just to learn its game type, then hands off to the right view.
export default function ArenaMatchRouter({ matchId }: { matchId: string }) {
  const { data: match, isLoading, isError } = useQuery({
    queryKey: ["arena-match-meta", matchId],
    queryFn: () => fetchMatch(matchId),
  });

  if (isLoading) return <div className="py-20 text-center text-ink-faint">Loading match…</div>;
  if (isError || !match)
    return (
      <div className="py-20 text-center text-ink-dim">
        Match not found.{" "}
        <Link href="/arena" className="text-brand-light hover:underline">
          Back to arena
        </Link>
      </div>
    );

  return match.game === "uno" ? <UnoTable matchId={matchId} /> : <ChessMatch matchId={matchId} />;
}
