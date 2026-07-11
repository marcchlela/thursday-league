"use client";

import { useLeagueData } from "@/hooks/useLeagueData";
import { careerStats } from "@/lib/scoring";
import { Card, EmptyState, Pill, Stat } from "@/components/ui";

export default function PlayersPage() {
  const { data, loading, error } = useLeagueData();
  if (loading) return <div>Loading players...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;

  const players = [...data.players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-5xl uppercase">Players</h1>
        <p className="mt-2 text-chalk/60">The actual Thursday roster, separate from fantasy accounts.</p>
      </div>
      {!players.length ? <EmptyState title="No roster yet" text="Admin can add players from the Admin page." /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {players.map(player => {
          const stats = careerStats({ player, games: data.games, lineups: data.lineups, events: data.events, playerStats: data.playerStats });
          return (
            <Card key={player.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl uppercase">{player.name}</h2>
                  <p className="text-sm text-chalk/50">Default: {player.default_position === "goalkeeper" ? "Goalkeeper" : "Outfield"}</p>
                </div>
                <Pill>{player.active ? "Active" : "Inactive"}</Pill>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Stat label="apps" value={stats.appearances} />
                <Stat label="goals" value={stats.goals} />
                <Stat label="assists" value={stats.assists} />
                <Stat label="clean sheets" value={stats.cleanSheets} />
                <Stat label="saves" value={stats.saves} />
                <Stat label="own goals" value={stats.ownGoals} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
