"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useLeagueData } from "@/hooks/useLeagueData";
import { careerStats } from "@/lib/scoring";
import { isCompetitionEligible } from "@/lib/playerEligibility";
import { LeagueData, Player } from "@/lib/types";
import { currentSeason } from "@/lib/utils";
import { Card, EmptyState, ErrorState, LoadingState, Pill, Select, TabList, TextInput } from "@/components/ui";

export default function PlayersPage() {
  const { data, loading, error, reload } = useLeagueData();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"players" | "stats">("players");
  const [seasonScope, setSeasonScope] = useState("current");
  if (loading) return <LoadingState label="Loading players" cards={6} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

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
      <TabList idPrefix="players" label="Player views" tabs={[{ id: "players", label: "Players" }, { id: "stats", label: "Stats" }]} active={tab} onChange={value => setTab(value as "players" | "stats")} />
      {tab === "stats" ? <SeasonScopeSelect data={data} value={seasonScope} onChange={setSeasonScope} /> : null}
      {!players.length ? <EmptyState title="No roster yet" text="Admin can add players from the Admin page." /> : null}
      <div id={`players-${tab}-panel`} role="tabpanel" aria-labelledby={`players-${tab}-tab`}>{tab === "players" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {players.map(player => {
          return (
            <Card key={player.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl uppercase">{player.name}</h2>
                  <p className="text-sm text-chalk/50">Default: {player.default_position === "goalkeeper" ? "Goalkeeper" : "Outfield"}</p>
                </div>
                <Pill>{!isCompetitionEligible(player) ? "Guest" : player.archived_at ? "Archived" : player.active ? "Active" : "Inactive"}</Pill>
              </div>
              <p className="mt-5 text-sm text-chalk/55">{isCompetitionEligible(player) ? "Open the Stats tab for appearances, goals, assists, saves, clean sheets, and own goals." : "Available for lineups and match scoring, but excluded from league statistics, fantasy, and betting."}</p>
            </Card>
          );
        })}
      </div> : <PlayerStatBoards players={players} data={data} seasonScope={seasonScope} />}</div>
    </div>
  );
}

function PlayerStatBoards({ players, data, seasonScope }: { players: Player[]; data: LeagueData; seasonScope: string }) {
  const currentSeasonId = currentSeason(data)?.id;
  const selectedSeasonId = seasonScope === "current" ? currentSeasonId : seasonScope === "all" ? null : seasonScope;
  const games = selectedSeasonId ? data.games.filter(game => game.season_id === selectedSeasonId) : data.games;
  const rows = players.filter(isCompetitionEligible).map(player => ({ player, stats: careerStats({ player, games, lineups: data.lineups, events: data.events, playerStats: data.playerStats }) }));
  if (!rows.length) return <EmptyState title="No eligible players" text="Guest players are intentionally excluded from statistics." />;
  const boards = [
    ["Appearances", "appearances"], ["Goals", "goals"], ["Assists", "assists"], ["Saves", "saves"], ["Clean sheets", "cleanSheets"], ["Own goals", "ownGoals"]
  ] as const;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{boards.map(([label, key]) => <Card key={key}><h2 className="font-display text-3xl uppercase">{label}</h2><div className="mt-4 space-y-2">{[...rows].sort((a, b) => b.stats[key] - a.stats[key] || a.player.name.localeCompare(b.player.name)).map((row, index) => <div key={row.player.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"><span className="font-mono text-xs text-chalk/40">#{index + 1}</span><span className="truncate font-semibold">{row.player.name}</span><span className="font-mono text-xl text-perimeter-400">{row.stats[key]}</span></div>)}</div></Card>)}</div>;
}

function SeasonScopeSelect({ data, value, onChange }: { data: LeagueData; value: string; onChange: (value: string) => void }) {
  const current = currentSeason(data);
  return <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold">Statistics period</div><div className="text-sm text-chalk/45">Switch between a season and the complete league history.</div></div><Select className="sm:w-64" value={value} onChange={event => onChange(event.target.value)}><option value="current">{current ? `${current.name} · current season` : "Current season"}</option><option value="all">All-time</option>{data.seasons.filter(season => season.id !== current?.id).map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</Select></div>;
}
