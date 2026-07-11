"use client";

import Link from "next/link";
import { Game, GameLineup, GamePlayerStat, MatchEvent, Player } from "@/lib/types";
import { calculateScore, eventScoringTeam } from "@/lib/scoring";
import { formatDateTime, playerName, sortLineupsByRole, statusLabel } from "@/lib/utils";
import { Card, EmptyState, Pill } from "./ui";

export function GameSummary({ game, players, lineups, events, playerStats, title }: { game?: Game; players: Player[]; lineups: GameLineup[]; events: MatchEvent[]; playerStats: GamePlayerStat[]; title: string }) {
  if (!game) return <EmptyState title={title} text="No game here yet." />;

  const gameLineups = lineups.filter(l => l.game_id === game.id);
  const gameEvents = events.filter(e => e.game_id === game.id);
  const gamePlayerStats = playerStats.filter(stat => stat.game_id === game.id);
  const score = calculateScore(gameEvents, gameLineups, gamePlayerStats);

  return (
    <Link href={`/games/${game.id}`} className="block rounded-3xl transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-perimeter-400">
      <Card className="overflow-hidden p-0">
        <div className="relative bg-turf p-5">
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[.25em] text-chalk/60">{title}</p>
              <h2 className="mt-1 font-display text-4xl uppercase">{formatDateTime(game.game_date)}</h2>
            </div>
            <Pill className={game.status === "live" ? "border-floodlight/40 bg-floodlight/20 text-floodlight" : ""}>{statusLabel(game.status)}</Pill>
          </div>
          <div className="relative z-10 mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <TeamBlock label="Team A" lineups={gameLineups.filter(l => l.team === "A")} players={players} />
            <div className="rounded-3xl border-2 border-perimeter-400 bg-ink-900/80 px-5 py-4 text-center shadow-glow">
              <div className="font-mono text-5xl font-black tracking-tighter text-chalk">{score.A} - {score.B}</div>
              {game.status === "live" ? <div className="mt-1 text-xs font-bold uppercase tracking-widest text-floodlight">Live</div> : null}
            </div>
            <TeamBlock label="Team B" lineups={gameLineups.filter(l => l.team === "B")} players={players} align="right" />
          </div>
        </div>

        <div className="p-5">
          {gameLineups.length === 0 ? (
            <p className="text-sm text-chalk/60">Lineups coming soon.</p>
          ) : gameEvents.length === 0 ? (
            <p className="text-sm text-chalk/60">No events logged yet.</p>
          ) : (
            <div className="space-y-2">
              {gameEvents.map(event => {
                const scoringTeam = eventScoringTeam(event, gameLineups);
                return (
                  <div key={event.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                    <span>{event.minute != null ? `${event.minute}' - ` : ""}{event.event_type === "own_goal" ? "Own goal" : "Goal"} - {playerName(players, event.player_id)}{event.assist_player_id ? `, assist ${playerName(players, event.assist_player_id)}` : ""}</span>
                    <span className="font-mono text-perimeter-400">Team {scoringTeam || "?"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

function TeamBlock({ label, lineups, players, align = "left" }: { label: string; lineups: GameLineup[]; players: Player[]; align?: "left" | "right" }) {
  const sorted = sortLineupsByRole(players, lineups);
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="font-display text-2xl uppercase text-chalk">{label}</div>
      <div className="mt-2 hidden text-sm text-chalk/70 sm:block">
        {sorted.length ? sorted.map(l => playerName(players, l.player_id)).join(" - ") : "TBD"}
      </div>
    </div>
  );
}
