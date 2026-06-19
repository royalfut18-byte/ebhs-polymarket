import ChessMatch from "@/components/arena/ChessMatch";

// The match view. Only chess exists today; when Uno lands this will branch on
// the match's game type.
export default function ArenaMatchPage({ params }: { params: { matchId: string } }) {
  return <ChessMatch matchId={params.matchId} />;
}
