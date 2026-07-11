"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useLeagueData } from "@/hooks/useLeagueData";
import { calculateScore, eventScoringTeam } from "@/lib/scoring";
import { formatDateTime, playerName, sortLineupsByRole, statusLabel } from "@/lib/utils";
import { GameLineup, Player, TeamCode } from "@/lib/types";
import { Card, EmptyState, Pill, Stat } from "@/components/ui";

export default function GameDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useLeagueData();

  if (loading) return <div>Loading game...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;

  const game = data.games.find(g => g.id === params.id);
  if (!game) return <EmptyState title="Game not found" text="This game may have been deleted." />;

  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const events = data.events.filter(event => event.game_id === game.id);
  const playerStats = data.playerStats.filter(stat => stat.game_id === game.id);
  const score = calculateScore(events, lineups, playerStats);
  const squads = data.squads.filter(squad => squad.game_id === game.id);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-chalk/70 transition hover:text-chalk">
        <ArrowLeft size={16} /> Back to games
      </Link>

      <section className="overflow-hidden rounded-[2rem] border border-perimeter-400/35 bg-turf shadow-glow">
        <div className="bg-gradient-to-r from-black/80 via-black/55 to-black/25 p-6 md:p-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Pill className={game.status === "live" ? "border-floodlight/40 bg-floodlight/20 text-floodlight" : ""}>{statusLabel(game.status)}</Pill>
              <h1 className="mt-3 font-display text-5xl uppercase leading-none md:text-7xl">{formatDateTime(game.game_date)}</h1>
            </div>
            <div className="rounded-3xl border-2 border-perimeter-400 bg-ink-900/80 px-6 py-4 text-center shadow-glow">
              <div className="font-mono text-5xl font-black tracking-tighter">{score.A} - {score.B}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-chalk/50">Team A / Team B</div>
            </div>
          </div>
          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="lineup" value={lineups.length} />
            <Stat label="events" value={events.length} />
            <Stat label="player stats" value={playerStats.length} />
            <Stat label="fantasy squads" value={squads.length} />
            <Stat label="potm" value={playerName(data.players, game.potm_player_id)} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <TeamCard team="A" players={data.players} lineups={lineups} />
        <TeamCard team="B" players={data.players} lineups={lineups} />
      </div>

      {playerStats.length ? (
        <Card>
          <h2 className="font-display text-3xl uppercase">Player Stats</h2>
          <div className="mt-4 space-y-2">
            {playerStats.map(stat => (
              <div key={stat.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="font-semibold">{playerName(data.players, stat.player_id)}</span>
                <span className="font-mono text-perimeter-400">{stat.goals} G, {stat.assists} A, {stat.saves} S</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-display text-3xl uppercase">Events</h2>
        {!events.length ? <p className="mt-4 text-sm text-chalk/60">No events logged yet.</p> : null}
        <div className="mt-4 space-y-2">
          {events.map(event => {
            const scoringTeam = eventScoringTeam(event, lineups);
            return (
              <div key={event.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                <span>{event.minute != null ? `${event.minute}' - ` : ""}{event.event_type === "own_goal" ? "Own goal" : "Goal"} - {playerName(data.players, event.player_id)}{event.assist_player_id ? `, assist ${playerName(data.players, event.assist_player_id)}` : ""}</span>
                <span className="font-mono text-perimeter-400">Team {scoringTeam || "?"}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function TeamCard({ team, players, lineups }: { team: TeamCode; players: Player[]; lineups: GameLineup[] }) {
  const teamLineups = sortLineupsByRole(players, lineups.filter(lineup => lineup.team === team));

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl uppercase">Team {team}</h2>
        <Pill>{teamLineups.length}</Pill>
      </div>
      <div className="mt-4 space-y-2">
        {teamLineups.length ? teamLineups.map(lineup => (
          <div key={lineup.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="font-semibold">{playerName(players, lineup.player_id)}</span>
            <span className="rounded-xl bg-perimeter-400/15 px-2 py-1 text-xs font-black uppercase text-perimeter-400">{lineup.role === "goalkeeper" ? "GK" : "O"}</span>
          </div>
        )) : <p className="text-sm text-chalk/60">Lineup pending.</p>}
      </div>
    </Card>
  );
}
