"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronRight, Crown, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { allTimeLeaderboard, calculateScore, weeklyLeaderboard } from "@/lib/scoring";
import { currentSeason, formatDateTime } from "@/lib/utils";
import { FantasyPick, Game, LeagueData } from "@/lib/types";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { EmptyState, Pill, Select, TabList } from "./ui";
import { PitchPicker } from "./PitchPicker";
import { PlaySwitcher } from "./PlaySwitcher";
import { TeamCrest } from "./TeamCrest";

type FantasyTab = "set" | "standings" | "history";

export function FantasyTabs({ data, reload }: { data: LeagueData; reload: () => void | Promise<void> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: FantasyTab = requestedTab === "standings" || requestedTab === "history" ? requestedTab : "set";

  function setTab(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    if (nextTab !== "history") params.delete("game");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <PlaySwitcher active="fantasy" />
      <TabList idPrefix="fantasy" label="Fantasy views" tabs={[{ id: "set", label: "Set Team" }, { id: "standings", label: "Standings" }, { id: "history", label: "History" }]} active={tab} onChange={setTab} />
      <div id={`fantasy-${tab}-panel`} role="tabpanel" aria-labelledby={`fantasy-${tab}-tab`}>
        {tab === "set" ? <SetTeam data={data} reload={reload} /> : null}
        {tab === "standings" ? <Standings data={data} /> : null}
        {tab === "history" ? <History data={data} /> : null}
      </div>
    </div>
  );
}

function activeFantasyGame(data: LeagueData) {
  const openDraft = [...data.games]
    .filter(game => game.status === "draft" && new Date(game.game_date).getTime() > Date.now())
    .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())[0];
  if (openDraft) return openDraft;
  return [...data.games].filter(game => game.status === "live" || game.status === "draft").sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime())[0];
}

function SetTeam({ data, reload }: { data: LeagueData; reload: () => void | Promise<void> }) {
  const { user } = useAuthProfile();
  const game = activeFantasyGame(data);
  const lineups = useMemo(() => game ? data.lineups.filter(lineup => lineup.game_id === game.id) : [], [data.lineups, game]);
  const extraPlayers = useMemo(() => game ? data.playerStats.filter(stat => stat.game_id === game.id).map(stat => ({ player_id: stat.player_id, role: stat.role })) : [], [data.playerStats, game]);
  const squad = useMemo(() => game && user ? data.squads.find(item => item.game_id === game.id && item.user_id === user.id) : undefined, [data.squads, game, user]);
  const initialPicks = useMemo(() => squad ? data.picks.filter(pick => pick.squad_id === squad.id) : [], [data.picks, squad]);

  if (!game || !user) return <EmptyState title="No fantasy game open" text="Once the admin sets a lineup, your pitch picker appears here." />;

  const locked = game.status === "live" || game.status === "final" || Date.now() >= new Date(game.game_date).getTime();
  const statusLabel = locked ? "Picks locked" : initialPicks.length === 5 ? "Picks saved" : "Picks open";

  async function savePicks(draft: Omit<FantasyPick, "id" | "squad_id" | "created_at">[]) {
    const submittedPicks = draft.map(({ player_id, role, is_captain, slot_index }) => ({ player_id, role, is_captain, slot_index }));
    const { error } = await supabase.rpc("save_fantasy_squad", { target_game_id: game!.id, submitted_picks: submittedPicks });
    if (error) throw error;
    await reload();
  }

  return (
    <div className="space-y-4">
      <FantasyGamePreview game={game} data={data} statusLabel={statusLabel} locked={locked} />
      {lineups.length ? <PitchPicker players={data.players} lineups={lineups} extraPlayers={extraPlayers} initialPicks={initialPicks} locked={locked} onSave={savePicks} /> : <EmptyState title="Lineup pending" text="This game exists, but the available players have not been confirmed yet." />}
    </div>
  );
}

function FantasyGamePreview({ game, data, statusLabel, locked }: { game: Game; data: LeagueData; statusLabel: string; locked: boolean }) {
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const score = calculateScore(data.events.filter(event => event.game_id === game.id), lineups, data.playerStats.filter(stat => stat.game_id === game.id));
  const showScore = game.status === "live" || game.status === "final";

  return (
    <section className="relative grid min-h-[6.8rem] grid-cols-[1fr_auto_1fr] items-center gap-2 overflow-hidden rounded-[1.3rem] border border-league-gold/25 bg-ink-850 px-3 pb-3 pt-8 shadow-[0_9px_24px_rgba(0,0,0,.13)] sm:gap-5 sm:px-5" aria-label="Fantasy match">
      <span className="absolute left-3 top-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] text-chalk/40 sm:left-5"><CalendarDays size={12} /> {formatDateTime(game.game_date)}</span>
      <Pill className={`absolute right-3 top-2 border px-2 py-0.5 text-[9px] sm:right-5 ${locked ? "border-chalk/10 bg-chalk/[.04] text-chalk/45" : "border-turf-400/25 bg-turf-400/[.08] text-turf-100"}`}>{statusLabel}</Pill>
      <PreviewTeam gameId={game.id} team="A" />
      <div className="text-center">
        <div className="font-mono text-xl font-black tracking-tight sm:text-2xl">{showScore ? <>{score.A}<span className="px-1.5 text-chalk/25">–</span>{score.B}</> : <span className="font-display uppercase text-chalk/35">vs</span>}</div>
        <div className="mx-auto mt-1 h-px w-6 bg-league-gold/55" />
      </div>
      <PreviewTeam gameId={game.id} team="B" reverse />
    </section>
  );
}

function PreviewTeam({ gameId, team, reverse = false }: { gameId: string; team: "A" | "B"; reverse?: boolean }) {
  return <div className={`flex min-w-0 items-center gap-2 ${reverse ? "flex-row-reverse text-right" : ""}`}><TeamCrest gameId={gameId} team={team} className="h-11 w-9 shrink-0 sm:h-14 sm:w-11" /><span className="truncate text-xs font-bold sm:text-sm">Team {team}</span></div>;
}

function Standings({ data }: { data: LeagueData }) {
  const { user } = useAuthProfile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCurrentSeason = currentSeason(data);
  const requestedSeason = searchParams.get("season");
  const seasonScope = requestedSeason === "all" || data.seasons.some(season => season.id === requestedSeason)
    ? requestedSeason
    : selectedCurrentSeason?.id || "all";
  const selectedSeason = data.seasons.find(season => season.id === seasonScope);
  const standingsGames = seasonScope === "all" ? data.games : data.games.filter(game => game.season_id === seasonScope);
  const board = allTimeLeaderboard({ ...data, games: standingsGames });

  function chooseSeason(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "standings");
    params.set("season", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <section className="mx-auto max-w-3xl overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-league-gold/15 p-4 sm:p-5">
        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/70">Fantasy table</div><h2 className="mt-1 font-display text-3xl uppercase">Standings</h2><p className="mt-1 text-sm text-chalk/45">{selectedSeason ? `${selectedSeason.name} season points` : "All-time fantasy points"}</p></div>
        <Select value={seasonScope || "all"} onChange={event => chooseSeason(event.target.value)} className="w-full rounded-xl border-league-gold/15 py-2 text-sm sm:w-56" aria-label="Standings season">
          {selectedCurrentSeason ? <option value={selectedCurrentSeason.id}>{selectedCurrentSeason.name} · current</option> : null}
          <option value="all">All-time</option>
          {data.seasons.filter(season => season.id !== selectedCurrentSeason?.id).map(season => <option key={season.id} value={season.id}>{season.name}</option>)}
        </Select>
      </div>
      <ol className="gold-dividers divide-y">
        {board.map(row => <li key={row.userId} className={`grid grid-cols-[2.4rem_1fr_auto] items-center gap-3 px-4 py-3.5 sm:px-5 ${row.userId === user?.id ? "bg-league-gold/[.055]" : ""}`}><span className={`grid h-8 w-8 place-items-center rounded-lg font-mono text-xs font-bold ${row.rank <= 3 ? "bg-league-gold/10 text-league-gold" : "bg-chalk/[.035] text-chalk/35"}`}>#{row.rank}</span><span className="truncate font-semibold">{row.username}{row.userId === user?.id ? <span className="ml-2 text-xs font-normal text-league-gold">you</span> : null}</span><span className="font-mono text-xl font-bold">{row.points}<span className="ml-1 text-[9px] font-normal uppercase text-chalk/35">pts</span></span></li>)}
      </ol>
    </section>
  );
}

function History({ data }: { data: LeagueData }) {
  const { user } = useAuthProfile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const games = data.games.filter(game => game.status === "final").sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());
  const requestedGameId = searchParams.get("game");
  const game = games.find(item => item.id === requestedGameId) || games[0];

  if (!game) return <EmptyState title="No fantasy history yet" text="Completed matchweeks and their fantasy results will appear here." />;

  const board = weeklyLeaderboard({ ...data, game });

  function chooseGame(gameId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "history");
    params.set("game", gameId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
        <div className="border-b border-league-gold/15 px-4 py-3 sm:px-5"><div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/70">Matchweeks</div><h2 className="mt-0.5 font-display text-2xl uppercase">Fantasy history</h2></div>
        <div className="gold-dividers divide-y">
          {games.map(item => {
            const itemLineups = data.lineups.filter(lineup => lineup.game_id === item.id);
            const score = calculateScore(data.events.filter(event => event.game_id === item.id), itemLineups, data.playerStats.filter(stat => stat.game_id === item.id));
            const personalResult = user ? weeklyLeaderboard({ ...data, game: item }).find(row => row.userId === user.id) : undefined;
            const selected = game.id === item.id;
            return (
              <button key={item.id} type="button" onClick={() => chooseGame(item.id)} aria-pressed={selected} className={`grid w-full gap-3 px-3 py-3.5 text-left transition sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5 ${selected ? "bg-league-gold/[.075]" : "hover:bg-chalk/[.025]"}`}>
                <div className="min-w-0">
                  <div className="mb-2 font-mono text-[9px] text-chalk/30">{formatDateTime(item.game_date)}</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <HistoryTeam gameId={item.id} team="A" />
                    <span className="font-mono text-lg font-black sm:text-xl">{score.A}<span className="px-1 text-chalk/25">–</span>{score.B}</span>
                    <HistoryTeam gameId={item.id} team="B" reverse />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-league-gold/[.22] pt-2 sm:min-w-44 sm:justify-end sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 sm:text-right">
                  <div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-wider text-chalk/30">Your points</div><div className="truncate text-sm font-bold">{personalResult ? `#${personalResult.rank} this week` : "No squad saved"}</div></div>
                  <span className="shrink-0 font-mono text-lg font-bold text-league-gold">{personalResult ? `${personalResult.points} pts` : "—"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
        <div className="flex items-center justify-between gap-3 border-b border-league-gold/15 px-4 py-3 sm:px-5"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/70">Selected week</div><h2 className="mt-0.5 font-display text-2xl uppercase">Weekly leaderboard</h2></div><Trophy size={23} className="text-league-gold" /></div>
        {board.length ? <ol className="gold-dividers divide-y">{board.map(row => <li key={row.userId}><Link href={`/fantasy/history/${game.id}/${row.userId}`} className={`group grid grid-cols-[2.4rem_1fr_auto_auto] items-center gap-3 px-4 py-3.5 transition hover:bg-league-gold/[.075] focus:outline-none focus-visible:bg-league-gold/[.075] sm:px-5 ${row.userId === user?.id ? "bg-league-gold/[.055]" : ""}`}><span className={`grid h-8 w-8 place-items-center rounded-lg ${row.rank === 1 ? "bg-league-gold text-gold-ink" : "bg-chalk/[.035] text-chalk/40"}`}>{row.rank === 1 ? <Crown size={15} /> : <span className="font-mono text-xs">#{row.rank}</span>}</span><span className="truncate font-semibold">{row.username}{row.userId === user?.id ? <span className="ml-2 text-xs font-normal text-league-gold">you</span> : null}</span><span className="font-mono text-xl font-bold">{row.points}<span className="ml-1 text-[9px] font-normal uppercase text-chalk/35">pts</span></span><ChevronRight size={16} className="text-chalk/20 transition group-hover:translate-x-0.5 group-hover:text-league-gold" /></Link></li>)}</ol> : <p className="p-8 text-center text-sm text-chalk/40">No squads were saved for this matchweek.</p>}
      </section>
    </div>
  );
}

function HistoryTeam({ gameId, team, reverse = false }: { gameId: string; team: "A" | "B"; reverse?: boolean }) {
  return <span className={`flex min-w-0 items-center gap-1.5 ${reverse ? "flex-row-reverse text-right" : ""}`}><TeamCrest gameId={gameId} team={team} className="h-8 w-7 shrink-0 sm:h-9 sm:w-8" /><span className="truncate text-[10px] font-bold sm:text-xs">Team {team}</span></span>;
}
