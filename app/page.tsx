"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  Dices,
  Shirt
} from "lucide-react";
import { FaFutbol } from "react-icons/fa6";
import { GiSoccerKick } from "react-icons/gi";
import type { IconType } from "react-icons";
import { NotificationOnboarding } from "@/components/NotificationOnboarding";
import { TeamCrest } from "@/components/TeamCrest";
import { ErrorState } from "@/components/ui";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useHomeBetStatus } from "@/hooks/useHomeBetStatus";
import { useLeagueData } from "@/hooks/useLeagueData";
import { isCompetitionEligible } from "@/lib/playerEligibility";
import { calculateScore, careerStats } from "@/lib/scoring";
import { Game, LeagueData } from "@/lib/types";
import { cn } from "@/lib/utils";

function matchDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Beirut"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

function matchTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Beirut"
  }).format(new Date(value));
}

function nextPlayableGame(games: Game[]) {
  const live = games.find(game => game.status === "live");
  if (live) return live;
  const nonFinal = games.filter(game => game.status !== "final");
  const future = nonFinal
    .filter(game => new Date(game.game_date).getTime() >= Date.now())
    .sort((first, second) => new Date(first.game_date).getTime() - new Date(second.game_date).getTime());
  return future[0] || nonFinal.sort((first, second) => new Date(second.game_date).getTime() - new Date(first.game_date).getTime())[0];
}

function lineupIsReady(data: LeagueData, gameId: string) {
  const gameLineups = data.lineups.filter(lineup => lineup.game_id === gameId);
  return (["A", "B"] as const).every(team => {
    const teamLineup = gameLineups.filter(lineup => lineup.team === team);
    return teamLineup.length === 5
      && teamLineup.filter(lineup => lineup.role === "goalkeeper").length === 1
      && teamLineup.every(lineup => lineup.slot_index != null);
  });
}

export default function HomePage() {
  const { data, loading, error, reload } = useLeagueData();
  const { user } = useAuthProfile();
  const nextGame = nextPlayableGame(data.games);
  const hasPlacedBet = useHomeBetStatus(user?.id, nextGame?.id);

  if (loading) return <HomeSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const recentFinal = [...data.games]
    .filter(game => game.status === "final")
    .sort((first, second) => new Date(second.game_date).getTime() - new Date(first.game_date).getTime())[0];
  const lineupsReady = nextGame ? lineupIsReady(data, nextGame.id) : false;
  const fantasySquad = nextGame && user ? data.squads.find(squad => squad.game_id === nextGame.id && squad.user_id === user.id) : undefined;
  const fantasyComplete = !!fantasySquad && data.picks.filter(pick => pick.squad_id === fantasySquad.id).length === 5;
  const leaders = buildLeaders(data);

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <NotificationOnboarding />

      {nextGame ? <NextMatch game={nextGame} lineupsReady={lineupsReady} /> : <NoUpcomingMatch />}

      <section aria-label="Match actions" className="grid grid-cols-2 gap-3 md:gap-4">
        <HomeAction
          href="/fantasy?tab=set"
          title="Set fantasy team"
          description="Pick your five"
          icon={Shirt}
          completed={fantasyComplete}
          completedLabel="Team set"
          tone="green"
        />
        <HomeAction
          href={nextGame ? `/betting?tab=markets&game=${nextGame.id}` : "/betting?tab=markets"}
          title="Place your bet"
          description="Make your picks"
          icon={Dices}
          completed={hasPlacedBet}
          completedLabel="Bet placed"
          tone="yellow"
        />
      </section>

      <RecentMatch game={recentFinal} data={data} />

      <section aria-label="Player leaders" className="grid grid-cols-2 gap-3 md:gap-4">
        <LeaderTable title="Goals" icon={FaFutbol} rows={leaders.goals} tone="green" />
        <LeaderTable title="Assists" icon={GiSoccerKick} rows={leaders.assists} tone="gold" />
      </section>
    </div>
  );
}

function NextMatch({ game, lineupsReady }: { game: Game; lineupsReady: boolean }) {
  return (
    <Link href={`/games/${game.id}`} className="group relative block min-h-[15.5rem] overflow-hidden rounded-[1.6rem] border border-league-gold/30 bg-[#151813] p-4 shadow-[0_14px_35px_rgba(0,0,0,.22),inset_0_1px_0_rgba(218,165,32,.07)] transition hover:border-league-gold/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold md:min-h-[17rem] md:p-6">
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-floodlight/[.08]" />
      <div className="pointer-events-none absolute -bottom-14 -left-8 h-32 w-48 rotate-[-8deg] bg-turf-400/[.07]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[44%] border-t border-white/[.05] bg-[linear-gradient(135deg,rgba(49,185,78,.08),transparent_60%)]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[44%] w-px bg-white/[.055]" />
      <div className="pointer-events-none absolute bottom-[13%] left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border border-white/[.055]" />

      <div className="relative flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-[.18em] text-turf-400">Next match</span>
        <ArrowUpRight size={18} className="text-chalk/35 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-chalk" />
      </div>

      <div className="relative mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:mt-4 md:gap-8">
        <TeamIdentity gameId={game.id} team="A" />
        <div className="text-center">
          <div className="font-display text-3xl uppercase text-chalk/35 md:text-4xl">vs</div>
          <div className="mx-auto mt-1 h-px w-7 bg-floodlight/60" />
        </div>
        <TeamIdentity gameId={game.id} team="B" />
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-chalk/65 md:mt-5 md:text-base">
        <span className="inline-flex items-center gap-2"><CalendarDays size={16} /> {matchDate(game.game_date)}</span>
        <span className="hidden h-4 w-px bg-white/10 sm:block" />
        <span className="inline-flex items-center gap-2"><Clock3 size={16} /> {matchTime(game.game_date)}</span>
      </div>

      <div className={cn("relative mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold", lineupsReady ? "border-turf-400/20 bg-turf-400/10 text-turf-100" : "border-white/[.09] bg-black/20 text-chalk/55")}>
        {lineupsReady ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}
        {lineupsReady ? "Lineups ready" : "Lineups not ready yet"}
      </div>
    </Link>
  );
}

function TeamIdentity({ gameId, team }: { gameId: string; team: "A" | "B" }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <TeamCrest gameId={gameId} team={team} className="h-[4.6rem] w-16 md:h-[5.4rem] md:w-[4.6rem]" />
      <span className="font-display text-xl uppercase tracking-wide md:text-2xl">Team {team}</span>
    </div>
  );
}

function HomeAction({ href, title, description, icon: Icon, completed, completedLabel, tone }: { href: string; title: string; description: string; icon: typeof Shirt; completed: boolean; completedLabel: string; tone: "green" | "yellow" }) {
  return (
    <Link href={href} className={cn(
      "group relative min-h-[7.25rem] overflow-hidden rounded-[1.35rem] border border-league-gold/25 p-3.5 shadow-[0_9px_24px_rgba(0,0,0,.16),inset_0_1px_0_rgba(218,165,32,.06)] transition hover:border-league-gold/45 focus:outline-none focus-visible:ring-2 md:min-h-[8rem] md:p-5",
      tone === "green" ? "bg-turf-900/45 focus-visible:ring-turf-400" : "bg-[#211b10] focus-visible:ring-floodlight",
      completed && "opacity-55 saturate-50"
    )}>
      <div className={cn("absolute -right-7 -top-8 h-24 w-24 rounded-full", tone === "green" ? "bg-turf-400/[.08]" : "bg-floodlight/[.08]")} />
      <div className="relative flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className={cn("grid h-9 w-9 place-items-center rounded-full", tone === "green" ? "bg-turf-400/12 text-turf-400" : "bg-floodlight/12 text-floodlight")}><Icon size={20} /></span>
          {completed ? <span className="grid h-8 w-8 place-items-center rounded-full bg-chalk text-ink-900"><Check size={18} strokeWidth={3} /></span> : <ChevronRight size={19} className="mt-1 text-chalk/35 transition group-hover:translate-x-1 group-hover:text-chalk" />}
        </div>
        <div>
          <h2 className="text-sm font-extrabold leading-tight sm:text-base md:text-lg">{title}</h2>
          <p className="mt-1 text-xs text-chalk/45 md:text-sm">{completed ? completedLabel : description}</p>
        </div>
      </div>
    </Link>
  );
}

function RecentMatch({ game, data }: { game?: Game; data: LeagueData }) {
  const score = game ? calculateScore(
    data.events.filter(event => event.game_id === game.id),
    data.lineups.filter(lineup => lineup.game_id === game.id),
    data.playerStats.filter(stat => stat.game_id === game.id)
  ) : null;

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <h2 className="text-xs font-black uppercase tracking-[.16em] text-chalk/55">Previous game</h2>
        <Link href="/games" className="inline-flex items-center gap-1 text-xs font-bold text-turf-400 hover:text-turf-100">See all <ChevronRight size={14} /></Link>
      </div>
      {game && score ? (
        <Link href={`/games/${game.id}`} className="group grid min-h-[7rem] grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[1.35rem] border border-league-gold/25 bg-[#171814] p-3.5 shadow-[0_9px_24px_rgba(0,0,0,.14),inset_0_1px_0_rgba(218,165,32,.05)] transition hover:border-league-gold/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold md:min-h-[8rem] md:p-5">
          <CompactTeam gameId={game.id} team="A" />
          <div className="text-center">
            <div className="font-mono text-3xl font-bold tracking-tight md:text-4xl">{score.A}<span className="px-1.5 text-chalk/25">–</span>{score.B}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-chalk/35">Final</div>
            <div className="mt-1 text-[10px] text-chalk/40 sm:text-xs">{matchDate(game.game_date)}</div>
          </div>
          <CompactTeam gameId={game.id} team="B" align="right" />
        </Link>
      ) : (
        <div className="rounded-[1.35rem] border border-dashed border-league-gold/25 bg-white/[.025] px-4 py-8 text-center text-sm text-chalk/45">The first result will appear here.</div>
      )}
    </section>
  );
}

function CompactTeam({ gameId, team, align = "left" }: { gameId: string; team: "A" | "B"; align?: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", align === "right" && "flex-row-reverse text-right")}>
      <TeamCrest gameId={gameId} team={team} className="h-12 w-10 shrink-0 sm:h-14 sm:w-12" />
      <span className="truncate text-xs font-bold sm:text-sm md:text-base">Team {team}</span>
    </div>
  );
}

function buildLeaders(data: LeagueData) {
  const finalGames = data.games.filter(game => game.status === "final");
  const stats = data.players
    .filter(isCompetitionEligible)
    .map(player => ({ player, stats: careerStats({ player, games: finalGames, lineups: data.lineups, events: data.events, playerStats: data.playerStats }) }));
  const rank = (field: "goals" | "assists") => [...stats]
    .sort((first, second) => second.stats[field] - first.stats[field] || first.player.name.localeCompare(second.player.name))
    .slice(0, 5)
    .map(item => ({ id: item.player.id, name: item.player.name, value: item.stats[field] }));
  return { goals: rank("goals"), assists: rank("assists") };
}

function LeaderTable({ title, icon: Icon, rows, tone }: { title: string; icon: IconType; rows: { id: string; name: string; value: number }[]; tone: "green" | "gold" }) {
  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-[#171814] shadow-[0_9px_24px_rgba(0,0,0,.13),inset_0_1px_0_rgba(218,165,32,.05)]">
      <div className="flex items-center justify-between border-b border-league-gold/15 px-3 py-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", tone === "green" ? "bg-turf-400/10 text-turf-400" : "bg-league-gold/10 text-league-gold")}><Icon size={18} /></span>
          <h2 className="truncate text-sm font-extrabold md:text-base">{title}</h2>
        </div>
        <span className="hidden text-[9px] font-bold uppercase tracking-widest text-chalk/30 sm:block">All time</span>
      </div>
      <ol className="gold-dividers divide-y">
        {rows.map((row, index) => (
          <li key={row.id} className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-1.5 px-3 py-2.5 text-xs md:grid-cols-[1.25rem_minmax(0,1fr)_auto] md:gap-2 md:px-4 md:text-sm">
            <span className="font-mono text-[10px] text-chalk/30 md:text-xs">{index + 1}</span>
            <span className="truncate font-semibold text-chalk/75">{row.name}</span>
            <span className="font-mono text-sm font-bold text-turf-400 md:text-base">{row.value}</span>
          </li>
        ))}
        {!rows.length ? <li className="px-3 py-8 text-center text-xs text-chalk/40">No stats yet</li> : null}
      </ol>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5" role="status" aria-live="polite" aria-label="Loading Home">
      <section className="relative min-h-[15.5rem] overflow-hidden rounded-[1.6rem] border border-league-gold/30 bg-[#151813] p-4 shadow-[0_14px_35px_rgba(0,0,0,.22),inset_0_1px_0_rgba(218,165,32,.07)] md:min-h-[17rem] md:p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-[.18em] text-turf-400">Next match</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-chalk/30">Loading match</span>
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8">
          <SkeletonTeam />
          <div className="text-center"><div className="font-display text-3xl uppercase text-chalk/15 md:text-4xl">vs</div><SkeletonBlock className="mx-auto mt-2 h-px w-7" /></div>
          <SkeletonTeam />
        </div>
        <div className="mt-5 flex items-center justify-center gap-4"><SkeletonBlock className="h-4 w-24 rounded-full" /><SkeletonBlock className="h-4 w-16 rounded-full" /></div>
        <SkeletonBlock className="mx-auto mt-4 h-7 w-36 rounded-full" />
      </section>

      <section aria-label="Loading match actions" className="grid grid-cols-2 gap-3 md:gap-4">
        <SkeletonAction title="Set fantasy team" tone="green" />
        <SkeletonAction title="Place your bet" tone="gold" />
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between px-0.5">
          <h2 className="text-xs font-black uppercase tracking-[.16em] text-chalk/55">Previous game</h2>
          <span className="text-[10px] font-bold uppercase tracking-widest text-chalk/30">Loading result</span>
        </div>
        <div className="grid min-h-[7rem] grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[1.35rem] border border-league-gold/25 bg-[#171814] p-3.5 shadow-[0_9px_24px_rgba(0,0,0,.14),inset_0_1px_0_rgba(218,165,32,.05)] md:min-h-[8rem] md:p-5">
          <SkeletonCompactTeam />
          <div className="space-y-2"><SkeletonBlock className="mx-auto h-8 w-20 rounded-lg" /><SkeletonBlock className="mx-auto h-3 w-12 rounded-full" /></div>
          <SkeletonCompactTeam reverse />
        </div>
      </section>

      <section aria-label="Loading player leaders" className="grid grid-cols-2 gap-3 md:gap-4">
        <LeaderSkeleton title="Goals" icon={FaFutbol} tone="green" />
        <LeaderSkeleton title="Assists" icon={GiSoccerKick} tone="gold" />
      </section>
      <span className="sr-only">Loading the next match, actions, previous result, goals, and assists.</span>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn("skeleton-shimmer bg-white/[.045]", className)} />;
}

function SkeletonTeam() {
  return (
    <div className="flex flex-col items-center gap-2">
      <SkeletonBlock className="h-[4.6rem] w-14 rounded-[45%_45%_48%_48%] md:h-[5.4rem] md:w-[4.2rem]" />
      <SkeletonBlock className="h-5 w-16 rounded-md md:h-6 md:w-20" />
    </div>
  );
}

function SkeletonAction({ title, tone }: { title: string; tone: "green" | "gold" }) {
  return (
    <div className={cn("min-h-[7.25rem] rounded-[1.35rem] border border-league-gold/25 p-3.5 shadow-[0_9px_24px_rgba(0,0,0,.16),inset_0_1px_0_rgba(218,165,32,.06)] md:min-h-[8rem] md:p-5", tone === "green" ? "bg-turf-900/45" : "bg-[#211b10]")}>
      <div className="flex items-center justify-between"><SkeletonBlock className="h-9 w-9 rounded-full" /><SkeletonBlock className="h-5 w-5 rounded-full" /></div>
      <h2 className="mt-3 text-sm font-extrabold text-chalk/55 sm:text-base md:text-lg">{title}</h2>
      <SkeletonBlock className="mt-2 h-3 w-20 rounded-full" />
    </div>
  );
}

function SkeletonCompactTeam({ reverse = false }: { reverse?: boolean }) {
  return <div className={cn("flex items-center gap-2", reverse && "flex-row-reverse")}><SkeletonBlock className="h-12 w-10 shrink-0 rounded-[45%_45%_48%_48%] sm:h-14 sm:w-12" /><SkeletonBlock className="h-4 w-12 rounded-md sm:w-16" /></div>;
}

function LeaderSkeleton({ title, icon: Icon, tone }: { title: string; icon: IconType; tone: "green" | "gold" }) {
  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-[#171814] shadow-[0_9px_24px_rgba(0,0,0,.13),inset_0_1px_0_rgba(218,165,32,.05)]">
      <div className="flex items-center gap-2 border-b border-league-gold/15 px-3 py-3 md:px-4">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-45", tone === "green" ? "bg-turf-400/10 text-turf-400" : "bg-league-gold/10 text-league-gold")}><Icon size={18} /></span>
        <h2 className="text-sm font-extrabold text-chalk/55 md:text-base">{title}</h2>
      </div>
      <div className="gold-dividers divide-y">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-[1rem_minmax(0,1fr)_1.25rem] items-center gap-1.5 px-3 py-2.5 md:grid-cols-[1.25rem_minmax(0,1fr)_1.5rem] md:gap-2 md:px-4"><SkeletonBlock className="h-3 w-3 rounded" /><SkeletonBlock className={cn("h-3 rounded-full", index % 2 ? "w-14" : "w-20")} /><SkeletonBlock className="h-4 w-4 justify-self-end rounded" /></div>)}
      </div>
    </section>
  );
}

function NoUpcomingMatch() {
  return (
    <section className="relative min-h-[13rem] overflow-hidden rounded-[1.6rem] border border-dashed border-league-gold/30 bg-[#151813] p-5 shadow-[0_14px_35px_rgba(0,0,0,.18),inset_0_1px_0_rgba(218,165,32,.06)]">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-turf-400/[.07]" />
      <span className="text-xs font-black uppercase tracking-[.18em] text-turf-400">Next match</span>
      <div className="mt-10 max-w-sm"><h1 className="font-display text-3xl uppercase">Nothing scheduled yet</h1><p className="mt-2 text-sm text-chalk/50">The next match will appear here as soon as it is created.</p></div>
    </section>
  );
}
