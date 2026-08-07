"use client";

import { LeagueLink as Link } from "@/components/LeagueLink";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GameMatchHub } from "@/components/GameMatchHub";
import { EmptyState, ErrorState } from "@/components/ui";
import { useLeagueData } from "@/hooks/useLeagueData";
import { isGameAwaitingUpdate } from "@/lib/gameSchedule";

export default function GameDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error, reload } = useLeagueData();
  const game = data.games.find(item => item.id === params.id);

  if (loading) return <div className="skeleton-shimmer min-h-[32rem] rounded-[1.6rem] border border-league-gold/25" role="status"><span className="sr-only">Loading game details</span></div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!game) return <EmptyState title="Game not found" text="This game may have been deleted." />;

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <Link href={game.status === "final" || isGameAwaitingUpdate(game) ? "/games?view=all" : "/games?view=upcoming"} className="inline-flex items-center gap-2 text-sm font-bold text-chalk/45 transition hover:text-league-gold"><ArrowLeft size={16} /> All games</Link>
      <GameMatchHub game={game} data={data} />
    </div>
  );
}
