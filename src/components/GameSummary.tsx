"use client";

import { LeagueLink as Link } from "./LeagueLink";
import { Game, GameLineup, GamePlayerStat, MatchEvent } from "@/lib/types";
import { calculateScore } from "@/lib/scoring";
import { formatDateTime, statusLabel } from "@/lib/utils";
import { Card, EmptyState, Pill } from "./ui";

export function GameSummary({ game, lineups, events, playerStats, title }: { game?: Game; lineups: GameLineup[]; events: MatchEvent[]; playerStats: GamePlayerStat[]; title: string }) {
  if (!game) return <EmptyState title={title} text="No game here yet." />;

  const gameLineups = lineups.filter(l => l.game_id === game.id);
  const gameEvents = events.filter(e => e.game_id === game.id);
  const gamePlayerStats = playerStats.filter(stat => stat.game_id === game.id);
  const score = calculateScore(gameEvents, gameLineups, gamePlayerStats);

  return (
    <Link href={`/games/${game.id}`} className="block rounded-3xl transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-perimeter-400">
      <Card className="overflow-hidden p-0">
        <div className="relative bg-turf p-5 md:p-7">
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[.25em] text-chalk/60">{title}</p>
              <h2 className="mt-1 font-display text-4xl uppercase">{formatDateTime(game.game_date)}</h2>
            </div>
            <Pill className={game.status === "live" ? "border-floodlight/40 bg-floodlight/20 text-floodlight" : ""}>{statusLabel(game.status)}</Pill>
          </div>
          <div className="relative z-10 mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
            <div className="font-display text-2xl uppercase md:text-4xl">Team A</div>
            <div className="rounded-3xl border-2 border-perimeter-400 bg-ink-900/80 px-4 py-4 text-center shadow-glow md:px-7">
              <div className="font-mono text-4xl font-black tracking-tighter text-chalk md:text-6xl">{score.A} - {score.B}</div>
              {game.status === "live" ? <div className="mt-1 text-xs font-bold uppercase tracking-widest text-floodlight">Live</div> : null}
            </div>
            <div className="text-right font-display text-2xl uppercase md:text-4xl">Team B</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
