"use client";

import Link from "next/link";
import { useLeagueData } from "@/hooks/useLeagueData";
import { calculateScore } from "@/lib/scoring";
import { formatDateTime, playerName, sortLineupsByRole, statusLabel } from "@/lib/utils";
import { Card, EmptyState, Pill } from "@/components/ui";

export default function GamesPage() {
  const { data, loading, error } = useLeagueData();

  if (loading) return <div>Loading games...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;

  const games = [...data.games].sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-5xl uppercase">Games</h1>
        <p className="mt-2 text-chalk/60">Browse every upcoming, live, and finished Thursday game.</p>
      </div>

      {!games.length ? <EmptyState title="No games yet" text="Once the admin creates games, they appear here." /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {games.map(game => {
          const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
          const events = data.events.filter(event => event.game_id === game.id);
          const playerStats = data.playerStats.filter(stat => stat.game_id === game.id);
          const score = calculateScore(events, lineups, playerStats);
          const teamA = sortLineupsByRole(data.players, lineups.filter(lineup => lineup.team === "A"));
          const teamB = sortLineupsByRole(data.players, lineups.filter(lineup => lineup.team === "B"));

          return (
            <Link key={game.id} href={`/games/${game.id}`} className="block rounded-3xl transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-perimeter-400">
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Pill className={game.status === "live" ? "border-floodlight/40 bg-floodlight/20 text-floodlight" : ""}>{statusLabel(game.status)}</Pill>
                    <h2 className="mt-2 font-display text-3xl uppercase">{formatDateTime(game.game_date)}</h2>
                  </div>
                  <div className="font-mono text-3xl">{score.A} - {score.B}</div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <TeamPreview title="Team A" players={teamA.map(lineup => playerName(data.players, lineup.player_id))} />
                  <TeamPreview title="Team B" players={teamB.map(lineup => playerName(data.players, lineup.player_id))} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function TeamPreview({ title, players }: { title: string; players: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-chalk/45">{title}</div>
      <div className="mt-2 text-sm text-chalk/70">{players.length ? players.join(" - ") : "Lineup pending"}</div>
    </div>
  );
}
