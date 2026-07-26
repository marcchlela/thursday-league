"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GameMatchHub } from "@/components/GameMatchHub";
import { TeamCrest } from "@/components/TeamCrest";
import { EmptyState, ErrorState, Select } from "@/components/ui";
import { useLeagueData } from "@/hooks/useLeagueData";
import { calculateScore } from "@/lib/scoring";
import { Game, LeagueData } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type GamesView = "upcoming" | "results";

export default function GamesPage() {
  const { data, loading, error, reload } = useLeagueData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view: GamesView = searchParams.get("view") === "results" ? "results" : "upcoming";
  const requestedGameId = searchParams.get("game");

  if (loading) return <GamesPageSkeleton view={view} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const upcoming = [...data.games]
    .filter(game => game.status !== "final")
    .sort((first, second) => {
      if (first.status === "live" && second.status !== "live") return -1;
      if (second.status === "live" && first.status !== "live") return 1;
      return new Date(first.game_date).getTime() - new Date(second.game_date).getTime();
    });
  const results = [...data.games]
    .filter(game => game.status === "final")
    .sort((first, second) => new Date(second.game_date).getTime() - new Date(first.game_date).getTime());
  const selectedGame = upcoming.find(game => game.id === requestedGameId) || upcoming[0];

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

      {view === "upcoming" ? <>
        {upcoming.length > 1 ? <GameSelector games={upcoming} selectedId={selectedGame?.id || ""} onChange={gameId => updateParams("upcoming", gameId)} /> : null}
        {selectedGame ? <GameMatchHub key={selectedGame.id} game={selectedGame} data={data} initialTab="lineups" /> : <EmptyState title="No upcoming match" text="The next scheduled match will appear here." />}
      </> : <ResultsList games={results} data={data} />}
    </div>
  );
}

function GamesViewTabs({ active, onChange }: { active: GamesView; onChange: (view: GamesView) => void }) {
  const tabs: { id: GamesView; label: string }[] = [{ id: "upcoming", label: "Upcoming" }, { id: "results", label: "Results" }];
  return (
    <div className="grid grid-cols-2 rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1 shadow-[0_7px_20px_rgba(0,0,0,.13)]" role="tablist" aria-label="Games views">
      {tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => onChange(tab.id)} className={cn("relative rounded-[.85rem] px-4 py-3 text-sm font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", active === tab.id ? "bg-turf-400/[.09] text-turf-400 after:absolute after:inset-x-8 after:bottom-1 after:h-0.5 after:rounded-full after:bg-turf-400" : "text-chalk/45 hover:bg-chalk/[.035] hover:text-chalk")}>{tab.label}</button>)}
    </div>
  );
}

function GameSelector({ games, selectedId, onChange }: { games: Game[]; selectedId: string; onChange: (gameId: string) => void }) {
  return <label className="block rounded-[1.1rem] border border-league-gold/20 bg-ink-850 p-2.5 sm:flex sm:items-center sm:gap-3"><span className="mb-2 block shrink-0 px-1 text-[10px] font-black uppercase tracking-widest text-chalk/35 sm:mb-0">Choose fixture</span><Select value={selectedId} onChange={event => onChange(event.target.value)} className="rounded-xl border-chalk/[.07] py-2 text-sm">{games.map(game => <option key={game.id} value={game.id}>{formatDateTime(game.game_date)}{game.status === "live" ? " · Live" : ""}</option>)}</Select></label>;
}

function ResultsList({ games, data }: { games: Game[]; data: LeagueData }) {
  if (!games.length) return <EmptyState title="No results yet" text="Finalized matches will appear here." />;
  return (
    <section aria-label="Match results" className="space-y-3">
      {games.map(game => {
        const score = calculateScore(data.events.filter(event => event.game_id === game.id), data.lineups.filter(lineup => lineup.game_id === game.id), data.playerStats.filter(stat => stat.game_id === game.id));
        return (
          <Link key={game.id} href={`/games/${game.id}`} className="group relative grid min-h-[6.5rem] grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[1.3rem] border border-league-gold/25 bg-ink-850 px-3 pb-3 pt-7 shadow-[0_9px_24px_rgba(0,0,0,.13)] transition hover:border-league-gold/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:gap-5 sm:px-5">
            <span className="absolute left-3 top-2.5 font-mono text-[10px] text-chalk/35 sm:left-5">{resultDate(game.game_date)}</span>
            <ResultTeam gameId={game.id} team="A" />
            <div className="font-mono text-2xl font-black tracking-tight sm:text-3xl">{score.A}<span className="px-1.5 text-chalk/25">–</span>{score.B}</div>
            <ResultTeam gameId={game.id} team="B" reverse />
          </Link>
        );
      })}
    </section>
  );
}

function ResultTeam({ gameId, team, reverse = false }: { gameId: string; team: "A" | "B"; reverse?: boolean }) {
  return <div className={cn("flex min-w-0 items-center gap-2", reverse && "flex-row-reverse text-right")}><TeamCrest gameId={gameId} team={team} className="h-11 w-9 shrink-0 sm:h-14 sm:w-11" /><span className="truncate text-xs font-bold sm:text-sm">Team {team}</span></div>;
}

function resultDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Beirut" }).format(new Date(value));
}

function GamesPageSkeleton({ view }: { view: GamesView }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5" role="status" aria-label="Loading games">
      <div className="grid grid-cols-2 rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1"><div className={cn("rounded-[.85rem] px-4 py-3 text-center text-sm font-extrabold", view === "upcoming" ? "bg-turf-400/[.07] text-turf-400/55" : "text-chalk/25")}>Upcoming</div><div className={cn("rounded-[.85rem] px-4 py-3 text-center text-sm font-extrabold", view === "results" ? "bg-turf-400/[.07] text-turf-400/55" : "text-chalk/25")}>Results</div></div>
      {view === "upcoming" ? <><section className="min-h-[15.5rem] rounded-[1.6rem] border border-league-gold/30 bg-ink-850 p-4 md:min-h-[17rem] md:p-6"><div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-[.18em] text-turf-400">Next match</span><span className="text-[10px] font-bold uppercase tracking-widest text-chalk/25">Loading fixture</span></div><div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3"><SkeletonTeam /><span className="font-display text-3xl uppercase text-chalk/15">vs</span><SkeletonTeam /></div><div className="skeleton-shimmer mx-auto mt-5 h-4 w-40 rounded-full" /><div className="skeleton-shimmer mx-auto mt-4 h-7 w-36 rounded-full" /></section><div className="grid grid-cols-4 rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1">{["Lineups", "Stats", "Fantasy", "Bets"].map((label, index) => <div key={label} className={cn("rounded-[.85rem] px-1 py-2.5 text-center text-[11px] font-extrabold sm:text-sm", index === 0 ? "bg-league-gold/[.07] text-league-gold/50" : "text-chalk/20")}>{label}</div>)}</div><div className="relative mx-auto aspect-[3/5] min-h-[620px] w-full max-w-2xl overflow-hidden rounded-[1.7rem] border-2 border-league-gold/30 bg-[#0b3e22]/75"><div className="absolute inset-3 rounded-[1.25rem] border border-pitch-line/15" /><div className="absolute inset-x-3 top-1/2 border-t border-pitch-line/15" />{Array.from({ length: 10 }, (_, index) => <div key={index} className="skeleton-shimmer absolute h-10 w-20 rounded-xl" style={{ left: `${index % 2 ? 65 : 20}%`, top: `${8 + Math.floor(index / 2) * 20}%` }} />)}</div></> : <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton-shimmer h-[6.5rem] rounded-[1.3rem] border border-league-gold/20" />)}</div>}
      <span className="sr-only">Loading {view === "upcoming" ? "the fixture and match details" : "match results"}.</span>
    </div>
  );
}

function SkeletonTeam() {
  return <div className="flex flex-col items-center gap-2"><div className="skeleton-shimmer h-[4.6rem] w-14 rounded-[45%_45%_48%_48%]" /><div className="skeleton-shimmer h-5 w-16 rounded-md" /></div>;
}
