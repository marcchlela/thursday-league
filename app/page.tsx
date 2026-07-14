"use client";

import Link from "next/link";
import { useLeagueData } from "@/hooks/useLeagueData";
import { GameSummary } from "@/components/GameSummary";
import { Card, EmptyState, Stat } from "@/components/ui";
import { calculateScore } from "@/lib/scoring";
import { formatDateTime } from "@/lib/utils";

export default function HomePage() {
  const { data, loading, error } = useLeagueData();
  if (loading) return <div>Loading games...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;

  const liveGame = data.games.find(g => g.status === "live");
  const recentFinal = data.games.find(g => g.status === "final");
  const featured = liveGame || recentFinal;
  const nextGame = [...data.games]
    .filter(g => g.status !== "final" && g.id !== liveGame?.id)
    .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())[0];

  const gameCount = data.games.length;
  const participants = data.profiles.length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-perimeter-400/35 bg-turf shadow-glow">
        <div className="bg-gradient-to-r from-black/75 via-black/55 to-black/25 p-6 md:p-10">
          <p className="text-sm font-bold uppercase tracking-[.3em] text-perimeter-400">Home</p>
          <h1 className="mt-2 font-display text-6xl uppercase leading-none md:text-8xl">Thursday League</h1>
          <p className="mt-4 max-w-xl text-chalk/70">Live score, latest result, next game, and fantasy bragging rights - all in one place.</p>
          <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
            <Stat label="games" value={gameCount} />
            <Stat label="participants" value={participants} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        {featured ? <GameSummary game={featured} players={data.players} lineups={data.lineups} events={data.events} playerStats={data.playerStats} title={liveGame ? "Live now" : "Most recent result"} /> : <EmptyState title="No results yet" text="Once a game goes live or final, it lands here." />}

        <Card>
          <h2 className="font-display text-3xl uppercase">Next upcoming game</h2>
          {nextGame ? (
            <div className="mt-5 space-y-5">
              <Link href={`/games/${nextGame.id}`} className="block rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-perimeter-400/50 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-perimeter-400">
                <div className="font-display text-4xl uppercase">{formatDateTime(nextGame.game_date)}</div>
                <div className="mt-2 text-sm text-chalk/55">{data.lineups.some(l => l.game_id === nextGame.id) ? "Lineups are set" : "Lineups coming soon"}</div>
              </Link>
              {data.lineups.some(l => l.game_id === nextGame.id) ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-chalk/45">Team A</div><div className="font-mono text-3xl">{calculateScore(data.events.filter(e => e.game_id === nextGame.id), data.lineups.filter(l => l.game_id === nextGame.id), data.playerStats.filter(stat => stat.game_id === nextGame.id)).A}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-chalk/45">Team B</div><div className="font-mono text-3xl">{calculateScore(data.events.filter(e => e.game_id === nextGame.id), data.lineups.filter(l => l.game_id === nextGame.id), data.playerStats.filter(stat => stat.game_id === nextGame.id)).B}</div></div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-chalk/60">No upcoming game created yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
