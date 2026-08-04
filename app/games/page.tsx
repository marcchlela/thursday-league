"use client";

import { Clock3 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GameMatchHub } from "@/components/GameMatchHub";
import { GameScheduleNavigator } from "@/components/GameScheduleNavigator";
import { LeagueLink as Link } from "@/components/LeagueLink";
import { TeamCrest } from "@/components/TeamCrest";
import { EmptyState, ErrorState } from "@/components/ui";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { useLeagueData } from "@/hooks/useLeagueData";
import { fixtureTabDate, isGameAwaitingUpdate, organizeGames } from "@/lib/gameSchedule";
import { calculateScore } from "@/lib/scoring";
import type { Game, LeagueData } from "@/lib/types";
import { cn, gameLineupIsReady } from "@/lib/utils";

type GamesView = "upcoming" | "all";

export default function GamesPage() {
  const { data, loading, error, reload } = useLeagueData();
  const { isLeagueAdmin } = useLeagueContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: GamesView = requestedView === "all" || requestedView === "results" ? "all" : "upcoming";
  const requestedGameId = searchParams.get("game");

  if (loading) return <GamesPageSkeleton view={view} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const schedule = organizeGames(data.games);
  const selectedGame = schedule.active.find(game => game.id === requestedGameId) || schedule.active[0];

  function updateParams(nextView: GamesView, gameId?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    if (gameId) params.set("game", gameId);
    else params.delete("game");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <GamesViewTabs active={view} onChange={next => updateParams(next)} />

      {view === "upcoming" ? (
        <>
          {selectedGame ? (
            <GameScheduleNavigator
              games={data.games}
              activeGames={schedule.active}
              selectedGame={selectedGame}
              onSelect={gameId => updateParams("upcoming", gameId)}
              onOpenGame={gameId => router.push(`${pathname}/${gameId}`)}
            />
          ) : null}
          {selectedGame ? (
            <GameMatchHub key={selectedGame.id} game={selectedGame} data={data} initialTab="lineups" />
          ) : (
            <EmptyState title="No upcoming match" text={isLeagueAdmin ? "Schedule the next match from Admin → Games. It will appear here immediately." : "A league admin has not scheduled the next match yet."} />
          )}
          {!selectedGame && schedule.awaitingUpdate.length ? (
            <p className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-center text-sm text-chalk/60">
              {schedule.awaitingUpdate.length} earlier game{schedule.awaitingUpdate.length === 1 ? " is" : "s are"} waiting for an admin update. You can still open {schedule.awaitingUpdate.length === 1 ? "it" : "them"} under All games.
            </p>
          ) : null}
        </>
      ) : (
        <AllGamesList schedule={schedule} data={data} isLeagueAdmin={isLeagueAdmin} />
      )}
    </div>
  );
}

function GamesViewTabs({ active, onChange }: { active: GamesView; onChange: (view: GamesView) => void }) {
  const tabs: { id: GamesView; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "all", label: "All games" },
  ];
  return (
    <div className="grid grid-cols-2 rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1 shadow-[0_7px_20px_rgba(0,0,0,.13)]" role="tablist" aria-label="Games views">
      {tabs.map(tab => (
        <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => onChange(tab.id)} className={cn("relative rounded-[.85rem] px-4 py-3 text-sm font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", active === tab.id ? "bg-turf-400/[.09] text-turf-400 after:absolute after:inset-x-8 after:bottom-1 after:h-0.5 after:rounded-full after:bg-turf-400" : "text-chalk/45 hover:bg-chalk/[.035] hover:text-chalk")}>{tab.label}</button>
      ))}
    </div>
  );
}

function AllGamesList({ schedule, data, isLeagueAdmin }: { schedule: ReturnType<typeof organizeGames>; data: LeagueData; isLeagueAdmin: boolean }) {
  if (!data.games.length) return <EmptyState title="No games yet" text={isLeagueAdmin ? "Schedule the first match from Admin → Games." : "A league admin has not scheduled a match yet."} />;
  return (
    <div className="space-y-6">
      <GameGroup title="Upcoming" games={schedule.active} data={data} />
      <GameGroup
        title="Awaiting update"
        description="These dates passed without a final result. They stay visible without being marked DNP, because only an admin knows whether the match was played, postponed, or cancelled."
        games={schedule.awaitingUpdate}
        data={data}
        tone="pending"
      />
      <GameGroup title="Results" games={schedule.results} data={data} />
    </div>
  );
}

function GameGroup({ title, description, games, data, tone }: { title: string; description?: string; games: Game[]; data: LeagueData; tone?: "pending" }) {
  if (!games.length) return null;
  return (
    <section aria-label={title}>
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <div><h2 className="font-display text-2xl uppercase text-chalk">{title}</h2>{description ? <p className="mt-1 max-w-2xl text-xs leading-relaxed text-chalk/45">{description}</p> : null}</div>
        <span className="font-mono text-xs text-chalk/35">{games.length}</span>
      </div>
      <div className="space-y-3">{games.map(game => <GameListCard key={game.id} game={game} data={data} tone={tone} />)}</div>
    </section>
  );
}

function GameListCard({ game, data, tone }: { game: Game; data: LeagueData; tone?: "pending" }) {
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const ready = gameLineupIsReady(game, lineups);
  const score = calculateScore(data.events.filter(event => event.game_id === game.id), lineups, data.playerStats.filter(stat => stat.game_id === game.id));
  const showScore = game.status === "final" || game.status === "live";
  const awaiting = isGameAwaitingUpdate(game);
  const label = game.status === "final"
    ? "Final"
    : game.status === "live"
      ? "Live"
      : awaiting
        ? ready ? "Awaiting result" : "Setup incomplete"
        : ready ? "Lineups ready" : "Lineups pending";

  return (
    <Link href={`/games/${game.id}`} className={cn("group relative grid min-h-[6.5rem] grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[1.3rem] border bg-ink-850 px-3 pb-3 pt-8 shadow-[0_9px_24px_rgba(0,0,0,.13)] transition hover:border-league-gold/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:gap-5 sm:px-5", tone === "pending" ? "border-amber-300/25" : "border-league-gold/25")}>
      <span className="absolute left-3 top-2.5 font-mono text-[10px] text-chalk/35 sm:left-5">{fixtureTabDate(game.game_date)}</span>
      <span className={cn("absolute right-3 top-2 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider sm:right-5", game.status === "live" ? "bg-red-400/12 text-red-300" : awaiting ? "bg-amber-300/10 text-amber-200" : game.status === "final" ? "bg-turf-400/10 text-turf-400" : "bg-chalk/[.05] text-chalk/50")}>{label}</span>
      <ResultTeam gameId={game.id} team="A" />
      <div className="min-w-[5rem] text-center">
        {showScore ? (
          <div className="font-mono text-2xl font-black tracking-tight sm:text-3xl">{score.A}<span className="px-1.5 text-chalk/25">–</span>{score.B}</div>
        ) : (
          <div className="inline-flex items-center gap-1.5 font-mono text-base font-black text-chalk sm:text-lg"><Clock3 size={14} className="text-league-gold/70" />{fixtureTime(game.game_date)}</div>
        )}
      </div>
      <ResultTeam gameId={game.id} team="B" reverse />
    </Link>
  );
}

function ResultTeam({ gameId, team, reverse = false }: { gameId: string; team: "A" | "B"; reverse?: boolean }) {
  return <div className={cn("flex min-w-0 items-center gap-2", reverse && "flex-row-reverse text-right")}><TeamCrest gameId={gameId} team={team} className="h-11 w-9 shrink-0 sm:h-14 sm:w-11" /><span className="truncate text-xs font-bold sm:text-sm">Team {team}</span></div>;
}

function fixtureTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}

function GamesPageSkeleton({ view }: { view: GamesView }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5" role="status" aria-label="Loading games">
      <div className="grid grid-cols-2 rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1"><div className={cn("rounded-[.85rem] px-4 py-3 text-center text-sm font-extrabold", view === "upcoming" ? "bg-turf-400/[.07] text-turf-400/55" : "text-chalk/25")}>Upcoming</div><div className={cn("rounded-[.85rem] px-4 py-3 text-center text-sm font-extrabold", view === "all" ? "bg-turf-400/[.07] text-turf-400/55" : "text-chalk/25")}>All games</div></div>
      {view === "upcoming" ? <><div className="skeleton-shimmer h-24 rounded-[1.2rem] border border-league-gold/20" /><div className="skeleton-shimmer min-h-[17rem] rounded-[1.6rem] border border-league-gold/20" /><div className="skeleton-shimmer min-h-[34rem] rounded-[1.7rem] border border-league-gold/20" /></> : <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton-shimmer h-[6.5rem] rounded-[1.3rem] border border-league-gold/20" />)}</div>}
      <span className="sr-only">Loading {view === "upcoming" ? "the fixture and match details" : "all games"}.</span>
    </div>
  );
}
