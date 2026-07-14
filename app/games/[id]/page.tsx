"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Crown } from "lucide-react";
import { useLeagueData } from "@/hooks/useLeagueData";
import { calculatePlayerBreakdown, calculateScore } from "@/lib/scoring";
import { formatDateTime, playerName, statusLabel } from "@/lib/utils";
import { GameLineup, LeagueData, TeamCode } from "@/lib/types";
import { Card, EmptyState, Pill } from "@/components/ui";

type DetailTab = "stats" | "lineups" | "fantasy";

export default function GameDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useLeagueData();
  const [tab, setTab] = useState<DetailTab>("stats");

  const game = data.games.find(g => g.id === params.id);
  const lineups = useMemo(() => data.lineups.filter(lineup => lineup.game_id === params.id), [data.lineups, params.id]);
  const events = useMemo(() => data.events.filter(event => event.game_id === params.id), [data.events, params.id]);
  const playerStats = useMemo(() => data.playerStats.filter(stat => stat.game_id === params.id), [data.playerStats, params.id]);

  if (loading) return <div>Loading game...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;
  if (!game) return <EmptyState title="Game not found" text="This game may have been deleted." />;

  const score = calculateScore(events, lineups, playerStats);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-chalk/70 transition hover:text-chalk">
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <section className="overflow-hidden rounded-[2rem] border border-perimeter-400/35 bg-turf shadow-glow">
        <div className="bg-gradient-to-r from-black/80 via-black/55 to-black/25 p-6 md:p-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Pill className={game.status === "live" ? "border-floodlight/40 bg-floodlight/20 text-floodlight" : ""}>{statusLabel(game.status)}</Pill>
              <h1 className="mt-3 font-display text-4xl uppercase leading-none md:text-6xl">{formatDateTime(game.game_date)}</h1>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center md:gap-8">
            <div className="font-display text-3xl uppercase md:text-5xl">Team A</div>
            <div className="flex items-center gap-2 font-mono text-4xl font-black tracking-tighter md:gap-4 md:text-7xl">
              <span>{score.A}</span><span className="text-chalk/35">-</span><span className="text-chalk/35">-</span><span className="text-chalk/35">-</span><span>{score.B}</span>
            </div>
            <div className="font-display text-3xl uppercase md:text-5xl">Team B</div>
          </div>

          <div className="mt-8 flex justify-center">
            <div className="rounded-2xl border border-floodlight/25 bg-black/30 px-5 py-3 text-center">
              <div className="text-xs font-bold uppercase tracking-[.2em] text-floodlight">Player of the match</div>
              <div className="mt-1 flex items-center justify-center gap-2 font-display text-2xl uppercase"><Crown size={19} /> {playerName(data.players, game.potm_player_id)}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex rounded-3xl border border-white/10 bg-white/[0.03] p-1">
        {(["stats", "lineups", "fantasy"] as DetailTab[]).map(item => (
          <button key={item} onClick={() => setTab(item)} className={`flex-1 rounded-2xl px-4 py-3 font-bold capitalize transition ${tab === item ? "bg-perimeter-400/20 text-chalk ring-1 ring-perimeter-400/30" : "text-chalk/55 hover:text-chalk"}`}>{item}</button>
        ))}
      </div>

      {tab === "stats" ? <GameStats data={data} gameId={game.id} /> : null}
      {tab === "lineups" ? <FullPitch data={data} lineups={lineups} /> : null}
      {tab === "fantasy" ? <FantasyPlayerTable data={data} gameId={game.id} /> : null}
    </div>
  );
}

function GameStats({ data, gameId }: { data: LeagueData; gameId: string }) {
  const lineups = data.lineups.filter(l => l.game_id === gameId);
  const manual = data.playerStats.filter(s => s.game_id === gameId);
  const events = data.events.filter(e => e.game_id === gameId);
  const ids = [...new Set([...lineups.map(l => l.player_id), ...manual.map(s => s.player_id)])];
  const rows = ids.map(id => {
    const lineup = lineups.find(l => l.player_id === id);
    const stat = manual.find(s => s.player_id === id);
    const role = lineup?.role || stat?.role || "outfield";
    return {
      id,
      name: playerName(data.players, id),
      role,
      goals: events.filter(e => e.event_type === "goal" && e.player_id === id).length + (stat?.goals || 0),
      assists: events.filter(e => e.event_type === "goal" && e.assist_player_id === id).length + (stat?.assists || 0),
      ownGoals: events.filter(e => e.event_type === "own_goal" && e.player_id === id).length,
      saves: stat?.saves || 0
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  if (!rows.length) return <EmptyState title="No player stats yet" text="Player stats will appear once the lineup or match stats are saved." />;
  return (
    <Card>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-3"><Pill>{row.role === "goalkeeper" ? "GK" : "OUT"}</Pill><span className="font-semibold">{row.name}</span></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm text-perimeter-400">
              <span>{row.goals} G</span><span>{row.assists} A</span><span>{row.ownGoals} OG</span>{row.role === "goalkeeper" ? <span>{row.saves} saves</span> : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FullPitch({ data, lineups }: { data: LeagueData; lineups: GameLineup[] }) {
  return (
    <div className="relative min-h-[720px] overflow-hidden rounded-[2rem] border-2 border-white/40 bg-turf shadow-glow">
      <div className="absolute inset-x-0 top-1/2 border-t-2 border-white/50" />
      <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
      <div className="absolute left-1/2 top-0 h-20 w-48 -translate-x-1/2 border-x-2 border-b-2 border-white/50" />
      <div className="absolute bottom-0 left-1/2 h-20 w-48 -translate-x-1/2 border-x-2 border-t-2 border-white/50" />
      <FormationHalf team="A" data={data} lineups={lineups.filter(l => l.team === "A")} />
      <FormationHalf team="B" data={data} lineups={lineups.filter(l => l.team === "B")} />
    </div>
  );
}

function FormationHalf({ team, data, lineups }: { team: TeamCode; data: LeagueData; lineups: GameLineup[] }) {
  const keeper = lineups.find(l => l.role === "goalkeeper");
  const outfield = lineups.filter(l => l.role !== "goalkeeper");
  const slots = [keeper, ...outfield.slice(0, 2), ...outfield.slice(2, 4)];
  const positions = team === "A"
    ? ["top-[5%] left-1/2", "top-[20%] left-[28%]", "top-[20%] left-[72%]", "top-[38%] left-[28%]", "top-[38%] left-[72%]"]
    : ["bottom-[5%] left-1/2", "bottom-[20%] left-[28%]", "bottom-[20%] left-[72%]", "bottom-[38%] left-[28%]", "bottom-[38%] left-[72%]"];
  return <>{slots.map((lineup, index) => lineup ? <div key={lineup.id} className={`absolute ${positions[index]} z-10 -translate-x-1/2`}><PlayerMarker name={playerName(data.players, lineup.player_id)} role={index === 0 ? "GK" : index < 3 ? "DEF" : "FWD"} team={team} /></div> : null)}</>;
}

function PlayerMarker({ name, role, team }: { name: string; role: string; team: TeamCode }) {
  return <div className={`w-28 rounded-2xl border px-2 py-2 text-center shadow-lg backdrop-blur ${team === "A" ? "border-perimeter-400/60 bg-ink-900/85" : "border-floodlight/60 bg-ink-900/85"}`}><div className="text-[10px] font-black uppercase tracking-widest text-chalk/50">{role}</div><div className="truncate text-sm font-bold">{name}</div></div>;
}

function FantasyPlayerTable({ data, gameId }: { data: LeagueData; gameId: string }) {
  const game = data.games.find(g => g.id === gameId)!;
  const ids = [...new Set([...data.lineups.filter(l => l.game_id === gameId).map(l => l.player_id), ...data.playerStats.filter(s => s.game_id === gameId).map(s => s.player_id)])];
  const rows = ids.map(id => {
    const player = data.players.find(p => p.id === id)!;
    return calculatePlayerBreakdown({ game, player, lineups: data.lineups, events: data.events, playerStats: data.playerStats });
  }).sort((a, b) => b.points - a.points || a.playerName.localeCompare(b.playerName));
  if (!rows.length) return <EmptyState title="No fantasy points yet" text="Points will appear once player stats are available." />;
  return <Card><div className="space-y-2">{rows.map((row, index) => <div key={row.playerId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-perimeter-400/15 font-mono text-perimeter-400">#{index + 1}</span><div><div className="font-semibold">{row.playerName}</div><div className="text-xs text-chalk/45">{row.lines.join(" · ")}</div></div><span className="font-mono text-2xl">{row.points}</span></div>)}</div></Card>;
}
