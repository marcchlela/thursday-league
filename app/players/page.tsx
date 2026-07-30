"use client";

import { LeagueLink as Link } from "@/components/LeagueLink";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, ShieldCheck, Users } from "lucide-react";
import { FaFutbol } from "react-icons/fa6";
import { GiGoalKeeper, GiSoccerKick } from "react-icons/gi";
import { MdOutlineReplay } from "react-icons/md";
import { useLeagueData } from "@/hooks/useLeagueData";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { careerStats } from "@/lib/scoring";
import { isGuestPlayer } from "@/lib/playerEligibility";
import { LeagueData, Player } from "@/lib/types";
import { cn, currentSeason } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { EmptyState, ErrorState, Select, TabList, TextInput } from "@/components/ui";

type PlayerTab = "players" | "stats";
type StatKey = "appearances" | "goals" | "assists" | "saves" | "cleanSheets" | "ownGoals";
type BoardIcon = React.ComponentType<{ size?: number; className?: string }>;

const statBoards: { label: string; key: StatKey; icon: BoardIcon }[] = [
  { label: "Appearances", key: "appearances", icon: Users },
  { label: "Goals", key: "goals", icon: FaFutbol },
  { label: "Assists", key: "assists", icon: GiSoccerKick },
  { label: "Saves", key: "saves", icon: GiGoalKeeper },
  { label: "Clean sheets", key: "cleanSheets", icon: ShieldCheck },
  { label: "Own goals", key: "ownGoals", icon: MdOutlineReplay }
];

export default function PlayersPage() {
  const { data, loading, error, reload } = useLeagueData();
  const { isLeagueAdmin } = useLeagueContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const tab: PlayerTab = searchParams.get("tab") === "stats" ? "stats" : "players";
  const requestedSeason = searchParams.get("season");
  const seasonScope = requestedSeason && (requestedSeason === "all" || data.seasons.some(season => season.id === requestedSeason))
    ? requestedSeason
    : "current";

  if (loading) return <PlayersSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const roster = data.players
    .filter(player => player.active && !player.archived_at)
    .sort((first, second) => first.name.localeCompare(second.name));
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePlayers = roster.filter(player => player.name.toLowerCase().includes(normalizedQuery));

  function setView(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setSeasonScope(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "stats");
    params.set("season", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <header>
        <div className="text-[10px] font-black uppercase tracking-[.2em] text-league-gold/65">Thursday roster</div>
        <h1 className="mt-1 font-display text-4xl uppercase sm:text-5xl">Players</h1>
        <p className="mt-1.5 text-sm text-chalk/40">Find a player or explore the league&apos;s seasonal and all-time leaders.</p>
      </header>

      <TabList idPrefix="players" label="Player views" tabs={[{ id: "players", label: "Players" }, { id: "stats", label: "Stats" }]} active={tab} onChange={setView} />

      <div id={`players-${tab}-panel`} role="tabpanel" aria-labelledby={`players-${tab}-tab`}>
        {tab === "players" ? (
          <div className="space-y-4">
            <label className="relative block">
              <span className="sr-only">Search players</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-league-gold/55" size={18} />
              <TextInput value={query} onChange={event => setQuery(event.target.value)} placeholder="Search players…" className="rounded-[1.15rem] border-league-gold/20 bg-ink-850 py-3 pl-11 shadow-[0_7px_20px_rgba(0,0,0,.1)]" />
            </label>
            {!visiblePlayers.length ? <EmptyState title={normalizedQuery ? "No players found" : "The roster is empty"} text={normalizedQuery ? "Try another player name." : isLeagueAdmin ? "Add the first players from Admin → Roster. They will become available for lineups, fantasy, and eligible betting markets." : "A league admin has not added the roster yet."} /> : (
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5 xl:grid-cols-6">
                {visiblePlayers.map(player => <PlayerCircle key={player.id} player={player} />)}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <SeasonScopeSelect data={data} value={seasonScope} onChange={setSeasonScope} />
            <PlayerStatBoards players={data.players} data={data} seasonScope={seasonScope} />
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerCircle({ player }: { player: Player }) {
  return (
    <Link
      href={`/players/${player.id}`}
      className="group relative aspect-square min-w-0 overflow-hidden rounded-full border border-league-gold/25 bg-ink-850 p-2 text-center shadow-[0_8px_20px_rgba(0,0,0,.14)] transition hover:-translate-y-0.5 hover:border-league-gold/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:p-3"
      aria-label={`Open ${player.name}, ${player.default_position === "goalkeeper" ? "goalkeeper" : "outfield"} player`}
    >
      <span className="flex h-full flex-col items-center justify-center">
        <PlayerAvatar name={player.name} className="h-10 w-10 text-base transition group-hover:scale-105 sm:h-14 sm:w-14 sm:text-xl" />
        <span className="mt-1.5 w-full truncate px-1 text-[10px] font-bold sm:mt-2 sm:text-xs">{player.name}</span>
        <span className="mt-0.5 text-[7px] font-black uppercase tracking-[.15em] text-league-gold/60 sm:text-[9px]">{player.default_position === "goalkeeper" ? "GK" : "OUT"}</span>
        {isGuestPlayer(player) ? <span className="mt-0.5 text-[7px] font-black uppercase tracking-[.12em] text-chalk/30 sm:text-[8px]">Guest</span> : null}
      </span>
    </Link>
  );
}

function PlayerStatBoards({ players, data, seasonScope }: { players: Player[]; data: LeagueData; seasonScope: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const currentSeasonId = currentSeason(data)?.id;
  const selectedSeasonId = seasonScope === "current" ? currentSeasonId : seasonScope === "all" ? null : seasonScope;
  const games = selectedSeasonId ? data.games.filter(game => game.season_id === selectedSeasonId) : data.games;
  const rows = players.map(player => ({
    player,
    stats: careerStats({ player, games, lineups: data.lineups, events: data.events, playerStats: data.playerStats })
  }));

  if (!rows.length) return <EmptyState title="No players" text="Player statistics will appear after a completed match." />;

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      {statBoards.map(board => {
        const Icon = board.icon;
        const ordered = rows
          .filter(row => row.stats[board.key] > 0)
          .sort((first, second) => second.stats[board.key] - first.stats[board.key] || first.player.name.localeCompare(second.player.name));
        const open = !!expanded[board.key];
        const visible = open ? ordered : ordered.slice(0, 5);
        return (
          <section key={board.key} className="overflow-hidden rounded-[1.3rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
            <div className="flex items-center gap-3 border-b border-league-gold/15 px-4 py-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold"><Icon size={18} /></span>
              <div><div className="text-[8px] font-black uppercase tracking-[.17em] text-chalk/28">Leaderboard</div><h2 className="font-display text-2xl uppercase">{board.label}</h2></div>
            </div>
            {visible.length ? (
              <ol className="divide-y divide-league-gold/18">
                {rankRows(visible, board.key, ordered).map(row => (
                  <li key={row.player.id}>
                    <Link href={`/players/${row.player.id}`} className="group grid grid-cols-[2rem_2rem_1fr_auto] items-center gap-2.5 px-4 py-3 transition hover:bg-league-gold/[.04] focus:outline-none focus-visible:bg-league-gold/[.06]">
                      <span className={cn("font-mono text-xs", row.rank <= 3 ? "text-league-gold" : "text-chalk/30")}>#{row.rank}</span>
                      <PlayerAvatar name={row.player.name} className="h-8 w-8 text-[10px]" />
                      <span className="truncate text-sm font-semibold">{row.player.name}</span>
                      <span className="font-mono text-xl font-black text-league-gold">{row.stats[board.key]}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : <p className="px-4 py-8 text-center text-sm text-chalk/35">No {board.label.toLowerCase()} recorded in this period.</p>}
            {ordered.length > 5 ? (
              <button type="button" onClick={() => setExpanded(current => ({ ...current, [board.key]: !open }))} aria-expanded={open} className="flex w-full items-center justify-center gap-2 border-t border-league-gold/25 px-4 py-3 text-xs font-bold text-chalk/40 transition hover:bg-league-gold/[.04] hover:text-league-gold">
                {open ? "Show top 5" : `View all ${ordered.length}`}
                <ChevronDown size={15} className={cn("transition", open && "rotate-180")} />
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function rankRows(
  visible: { player: Player; stats: ReturnType<typeof careerStats> }[],
  key: StatKey,
  all: { player: Player; stats: ReturnType<typeof careerStats> }[]
) {
  return visible.map(row => {
    const index = all.findIndex(item => item.player.id === row.player.id);
    const previousWithDifferentValue = all.findIndex((item, itemIndex) => itemIndex <= index && item.stats[key] === row.stats[key]);
    return { ...row, rank: previousWithDifferentValue + 1 };
  });
}

function SeasonScopeSelect({ data, value, onChange }: { data: LeagueData; value: string; onChange: (value: string) => void }) {
  const current = currentSeason(data);
  return (
    <section className="flex flex-col gap-3 rounded-[1.2rem] border border-league-gold/25 bg-ink-850 p-4 shadow-[0_7px_20px_rgba(0,0,0,.1)] sm:flex-row sm:items-center sm:justify-between">
      <div><div className="text-sm font-semibold">Statistics period</div><div className="mt-0.5 text-xs text-chalk/35">Season results or complete league history</div></div>
      <Select className="rounded-xl border-league-gold/15 py-2.5 sm:w-64" value={value} onChange={event => onChange(event.target.value)}>
        <option value="current">{current ? `${current.name} · current season` : "Current season"}</option>
        <option value="all">All-time</option>
        {data.seasons.filter(season => season.id !== current?.id).map(season => <option key={season.id} value={season.id}>{season.name}</option>)}
      </Select>
    </section>
  );
}

function PlayersSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4" role="status" aria-label="Loading players">
      <div><div className="skeleton-shimmer h-3 w-28 rounded" /><div className="skeleton-shimmer mt-2 h-11 w-40 rounded-lg" /><div className="skeleton-shimmer mt-2 h-3 w-72 max-w-full rounded" /></div>
      <div className="skeleton-shimmer h-12 rounded-[1.15rem] border border-league-gold/15" />
      <div className="skeleton-shimmer h-12 rounded-[1.15rem] border border-league-gold/15" />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => <div key={index} className="skeleton-shimmer aspect-square rounded-full border border-league-gold/15" />)}
      </div>
      <span className="sr-only">Loading players</span>
    </div>
  );
}
