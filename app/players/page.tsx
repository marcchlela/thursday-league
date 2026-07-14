"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useLeagueData } from "@/hooks/useLeagueData";
import { careerStats } from "@/lib/scoring";
import { LeagueData, Player } from "@/lib/types";
import { Card, EmptyState, Pill, Stat, TextInput } from "@/components/ui";

export default function PlayersPage() {
  const { data, loading, error } = useLeagueData();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"players" | "stats">("players");
  if (loading) return <div>Loading players...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;

  const players = [...data.players].filter(player => player.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-5xl uppercase">Players</h1>
        <p className="mt-2 text-chalk/60">The actual Thursday roster, separate from fantasy accounts.</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-chalk/35" size={19} />
        <TextInput value={query} onChange={event => setQuery(event.target.value)} placeholder="Search players..." className="pl-12" />
      </div>
      <div className="flex rounded-3xl border border-white/10 bg-white/[0.03] p-1">
        {(["players", "stats"] as const).map(item => <button key={item} onClick={() => setTab(item)} className={`flex-1 rounded-2xl px-4 py-3 font-bold capitalize transition ${tab === item ? "bg-perimeter-400/20 text-chalk ring-1 ring-perimeter-400/30" : "text-chalk/55 hover:text-chalk"}`}>{item}</button>)}
      </div>
      {!players.length ? <EmptyState title="No roster yet" text="Admin can add players from the Admin page." /> : null}
      {tab === "players" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
      </div> : <PlayerStatBoards players={players} data={data} />}
    </div>
  );
}

function PlayerStatBoards({ players, data }: { players: Player[]; data: LeagueData }) {
  const rows = players.map(player => ({ player, stats: careerStats({ player, games: data.games, lineups: data.lineups, events: data.events, playerStats: data.playerStats }) }));
  const boards = [
    ["Appearances", "appearances"], ["Goals", "goals"], ["Assists", "assists"], ["Saves", "saves"], ["Clean sheets", "cleanSheets"], ["Own goals", "ownGoals"]
  ] as const;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{boards.map(([label, key]) => <Card key={key}><h2 className="font-display text-3xl uppercase">{label}</h2><div className="mt-4 space-y-2">{[...rows].sort((a, b) => b.stats[key] - a.stats[key] || a.player.name.localeCompare(b.player.name)).map((row, index) => <div key={row.player.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"><span className="font-mono text-xs text-chalk/40">#{index + 1}</span><span className="truncate font-semibold">{row.player.name}</span><span className="font-mono text-xl text-perimeter-400">{row.stats[key]}</span></div>)}</div></Card>)}</div>;
}
