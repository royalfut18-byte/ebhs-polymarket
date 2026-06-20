import ArenaMatchRouter from "@/components/arena/ArenaMatchRouter";

// The match view branches on the match's game type (chess vs uno).
export default function ArenaMatchPage({ params }: { params: { matchId: string } }) {
  return <ArenaMatchRouter matchId={params.matchId} />;
}
