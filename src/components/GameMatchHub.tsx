"use client";

import Image from "next/image";
import { LeagueLink as Link } from "./LeagueLink";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CheckCircle2, CircleDashed, Clock3, Crown } from "lucide-react";
import { FaFutbol } from "react-icons/fa6";
import { GiGoalKeeper, GiSoccerKick } from "react-icons/gi";
import { MdOutlineReplay } from "react-icons/md";
import type { IconType } from "react-icons";
import { calculatePlayerBreakdown, calculateScore } from "@/lib/scoring";
import { isGameAwaitingUpdate } from "@/lib/gameSchedule";
import { isFantasyEligible } from "@/lib/playerEligibility";
import { Game, GameLineup, LeagueData, TeamCode } from "@/lib/types";
import { cn, gameLineupIsReady, goalkeeperMode, playerName, statusLabel } from "@/lib/utils";
import { TeamCrest } from "./TeamCrest";
import { GameBettingPanel } from "./GameBettingPanel";
import { TiloMoment } from "./TiloMoment";

export type MatchDetailTab = "lineups" | "stats" | "fantasy" | "bets";

const detailTabs: { id: MatchDetailTab; label: string }[] = [
  { id: "lineups", label: "Lineups" },
  { id: "stats", label: "Stats" },
  { id: "fantasy", label: "Fantasy" },
  { id: "bets", label: "Bets" }
];

function matchDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

function matchTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}

export function GameMatchHub({ game, data, initialTab }: { game: Game; data: LeagueData; initialTab?: MatchDetailTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: MatchDetailTab = detailTabs.some(item => item.id === requestedTab)
    ? requestedTab as MatchDetailTab
    : initialTab || (game.status === "final" ? "stats" : "lineups");
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);

  function setTab(nextTab: MatchDetailTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <MatchHero game={game} data={data} lineups={lineups} />
      <MatchTabs active={tab} onChange={setTab} />
      <div id={`match-${tab}-panel`} role="tabpanel" aria-labelledby={`match-${tab}-tab`}>
        {tab === "lineups" ? (
          <div className="space-y-4">
            {game.status === "draft" && gameLineupIsReady(game, lineups) ? (
              <TiloMoment
                pose="matchday-ready"
                eyebrow="Tilo's matchday note"
                title="Lineups locked in."
                text="Both teams are confirmed. Take a look before matchday."
              />
            ) : null}
            <MatchPitch game={game} data={data} lineups={lineups} />
          </div>
        ) : null}
        {tab === "stats" ? <SparseMatchStats game={game} data={data} /> : null}
        {tab === "fantasy" ? <MatchFantasy game={game} data={data} /> : null}
        {tab === "bets" ? <GameBettingPanel game={game} data={data} /> : null}
      </div>
    </div>
  );
}

function MatchHero({ game, data, lineups }: { game: Game; data: LeagueData; lineups: GameLineup[] }) {
  const events = data.events.filter(event => event.game_id === game.id);
  const playerStats = data.playerStats.filter(stat => stat.game_id === game.id);
  const score = calculateScore(events, lineups, playerStats);
  const ready = gameLineupIsReady(game, lineups);
  const showScore = game.status === "live" || game.status === "final";
  const awaitingUpdate = isGameAwaitingUpdate(game);
  const heroLabel = game.status === "final" ? "Final result" : game.status === "live" ? "Live match" : awaitingUpdate ? "Awaiting update" : "Next match";
  const stateLabel = awaitingUpdate ? ready ? "Awaiting result" : "Setup incomplete" : statusLabel(game.status);

  return (
    <section className="relative min-h-[15.5rem] overflow-hidden rounded-[1.6rem] border border-league-gold/30 bg-ink-850 p-4 shadow-[0_14px_35px_rgba(0,0,0,.22),inset_0_1px_0_rgba(218,165,32,.07)] md:min-h-[17rem] md:p-6">
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-floodlight/[.08]" />
      <div className="pointer-events-none absolute -bottom-14 -left-8 h-32 w-48 rotate-[-8deg] bg-turf-400/[.07]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[44%] border-t border-chalk/[.05] bg-[linear-gradient(135deg,rgba(49,185,78,.08),transparent_60%)]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[44%] w-px bg-chalk/[.055]" />
      <div className="pointer-events-none absolute bottom-[13%] left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border border-chalk/[.055]" />

      <div className="relative flex items-center justify-between">
        <span className={cn("text-xs font-black uppercase tracking-[.18em]", awaitingUpdate ? "text-amber-200" : "text-turf-400")}>{heroLabel}</span>
        <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest", game.status === "live" ? "bg-red-400/15 text-red-300" : awaitingUpdate ? "bg-amber-300/10 text-amber-200" : "bg-chalk/[.05] text-chalk/60")}>{stateLabel}</span>
      </div>

      <div className="relative mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:mt-4 md:gap-8">
        <HeroTeam gameId={game.id} team="A" />
        <div className="text-center">
          {showScore ? <div className="font-mono text-3xl font-black tracking-tight md:text-5xl">{score.A}<span className="px-2 text-chalk/25">–</span>{score.B}</div> : <div className="font-display text-3xl uppercase text-chalk/35 md:text-4xl">vs</div>}
          <div className="mx-auto mt-1 h-px w-7 bg-league-gold/60" />
        </div>
        <HeroTeam gameId={game.id} team="B" />
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-chalk/65 md:mt-5 md:text-base">
        <span className="inline-flex items-center gap-2"><CalendarDays size={16} /> {matchDate(game.game_date)}</span>
        <span className="hidden h-4 w-px bg-chalk/10 sm:block" />
        <span className="inline-flex items-center gap-2"><Clock3 size={16} /> {matchTime(game.game_date)}</span>
      </div>

      {game.status === "final" && game.potm_player_id ? (
        <Link href={`/players/${game.potm_player_id}`} className="relative mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-league-gold/20 bg-league-gold/[.07] px-3 py-1.5 text-xs font-bold text-league-gold transition hover:border-league-gold/45 hover:bg-league-gold/[.11] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"><Crown size={14} /> POTM · {playerName(data.players, game.potm_player_id)}</Link>
      ) : (
        <div className={cn("relative mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold", ready ? "border-turf-400/20 bg-turf-400/10 text-turf-100" : "border-chalk/[.09] bg-black/20 text-chalk/55")}>
          {ready ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}{awaitingUpdate ? ready ? "Result not finalized" : "Lineups were not completed" : ready ? "Lineups ready" : "Lineups not ready yet"}
        </div>
      )}
    </section>
  );
}

function HeroTeam({ gameId, team }: { gameId: string; team: TeamCode }) {
  return <div className="flex flex-col items-center gap-1.5 text-center"><TeamCrest gameId={gameId} team={team} className="h-[4.6rem] w-16 md:h-[5.4rem] md:w-[4.6rem]" /><span className="font-display text-xl uppercase tracking-wide md:text-2xl">Team {team}</span></div>;
}

function MatchTabs({ active, onChange }: { active: MatchDetailTab; onChange: (tab: MatchDetailTab) => void }) {
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % detailTabs.length;
    else if (event.key === "ArrowLeft") target = (index - 1 + detailTabs.length) % detailTabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = detailTabs.length - 1;
    else return;
    event.preventDefault();
    const next = detailTabs[target];
    onChange(next.id);
    document.getElementById(`match-${next.id}-tab`)?.focus();
  }

  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-[1.15rem] border border-league-gold/25 bg-ink-850 p-1 shadow-[0_7px_20px_rgba(0,0,0,.13)]" role="tablist" aria-label="Match details">
      {detailTabs.map((item, index) => <button key={item.id} id={`match-${item.id}-tab`} type="button" role="tab" aria-selected={active === item.id} aria-controls={`match-${item.id}-panel`} tabIndex={active === item.id ? 0 : -1} onClick={() => onChange(item.id)} onKeyDown={event => onKeyDown(event, index)} className={cn("relative min-w-0 rounded-[.85rem] px-1 py-2.5 text-[11px] font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:text-sm", active === item.id ? "bg-league-gold/[.09] text-league-gold after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-league-gold" : "text-chalk/45 hover:bg-chalk/[.035] hover:text-chalk")}>{item.label}</button>)}
    </div>
  );
}

type SparseStatRow = {
  id: string;
  name: string;
  team: TeamCode;
  role: "goalkeeper" | "outfield";
  goals: number;
  assists: number;
  saves: number;
  ownGoals: number;
};

function SparseMatchStats({ game, data }: { game: Game; data: LeagueData }) {
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const manual = data.playerStats.filter(stat => stat.game_id === game.id);
  const events = data.events.filter(event => event.game_id === game.id);
  const ids = [...new Set([...lineups.map(lineup => lineup.player_id), ...manual.map(stat => stat.player_id)])];
  const rows = ids.map(id => {
    const player = data.players.find(item => item.id === id);
    if (!player) return null;
    const lineup = lineups.find(item => item.player_id === id);
    const stat = manual.find(item => item.player_id === id);
    const role = lineup?.role || stat?.role || "outfield";
    const row: SparseStatRow = {
      id,
      name: player.name,
      team: lineup?.team || stat?.team || "A",
      role,
      goals: events.filter(event => event.event_type === "goal" && event.player_id === id).length + (stat?.goals || 0),
      assists: events.filter(event => event.event_type === "goal" && event.assist_player_id === id).length + (stat?.assists || 0),
      saves: stat?.saves || 0,
      ownGoals: events.filter(event => event.event_type === "own_goal" && event.player_id === id).length + (stat?.own_goals || 0)
    };
    return row.goals || row.assists || row.saves || row.ownGoals ? row : null;
  }).filter(Boolean) as SparseStatRow[];

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4">
      <TeamStats game={game} team="A" rows={rows.filter(row => row.team === "A")} />
      <TeamStats game={game} team="B" rows={rows.filter(row => row.team === "B")} />
    </div>
  );
}

function TeamStats({ game, team, rows }: { game: Game; team: TeamCode; rows: SparseStatRow[] }) {
  const ordered = [...rows].sort((first, second) =>
    second.goals - first.goals
    || second.assists - first.assists
    || second.saves - first.saves
    || second.ownGoals - first.ownGoals
    || first.name.localeCompare(second.name)
  );
  return (
    <section className="overflow-hidden rounded-[1.3rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
      <div className="flex items-center gap-2 border-b border-league-gold/15 p-3 md:p-4"><TeamCrest gameId={game.id} team={team} className="h-10 w-9" /><div><div className="text-[10px] font-black uppercase tracking-widest text-chalk/35">Match stats</div><h2 className="font-display text-lg uppercase md:text-2xl">Team {team}</h2></div></div>
      <div className="space-y-2 p-2.5 md:p-3">
        {ordered.map(row => <Link key={row.id} href={`/players/${row.id}`} className="block rounded-xl border border-chalk/[.06] bg-black/20 p-2.5 transition hover:border-league-gold/30 hover:bg-league-gold/[.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"><div className="truncate text-xs font-bold sm:text-sm">{row.name}</div><div className="mt-2 flex flex-wrap gap-1.5">{row.goals > 0 ? <StatChip icon={FaFutbol} value={row.goals} label="goals" /> : null}{row.assists > 0 ? <StatChip icon={GiSoccerKick} value={row.assists} label="assists" /> : null}{row.saves > 0 ? <StatChip icon={GiGoalKeeper} value={row.saves} label="saves" /> : null}{row.ownGoals > 0 ? <StatChip icon={MdOutlineReplay} value={row.ownGoals} label="own goals" warning /> : null}</div></Link>)}
        {!ordered.length ? <p className="px-1 py-8 text-center text-xs leading-relaxed text-chalk/35">No positive stats recorded for Team {team} yet.</p> : null}
      </div>
    </section>
  );
}

function StatChip({ icon: Icon, value, label, warning = false }: { icon: IconType; value: number; label: string; warning?: boolean }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-lg px-1.5 py-1 font-mono text-[10px] font-bold sm:text-xs", warning ? "bg-red-400/10 text-red-300" : "bg-turf-400/10 text-turf-100")} title={`${value} ${label}`} aria-label={`${value} ${label}`}><Icon size={12} /> {value}</span>;
}

function MatchPitch({ game, data, lineups }: { game: Game; data: LeagueData; lineups: GameLineup[] }) {
  return (
    <section className="relative mx-auto aspect-[3/5] min-h-[620px] w-full max-w-2xl overflow-hidden rounded-[1.7rem] border-2 border-league-gold/40 bg-[#0b3e22] shadow-[0_16px_38px_rgba(0,0,0,.25),inset_0_0_45px_rgba(0,0,0,.24)]" aria-label="Full match lineup pitch">
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,.025)_0%,rgba(255,255,255,.025)_10%,rgba(0,0,0,.025)_10%,rgba(0,0,0,.025)_20%)]" />
      <div className="absolute inset-3 rounded-[1.25rem] border border-pitch-line/45" />
      <div className="absolute inset-x-3 top-1/2 border-t border-pitch-line/45" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-pitch-line/45 md:h-28 md:w-28" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pitch-line/60" />
      <div className="absolute left-1/2 top-3 h-16 w-36 -translate-x-1/2 rounded-b-2xl border-x border-b border-pitch-line/45 md:h-20 md:w-44" />
      <div className="absolute bottom-3 left-1/2 h-16 w-36 -translate-x-1/2 rounded-t-2xl border-x border-t border-pitch-line/45 md:h-20 md:w-44" />
      <div className="absolute left-1/2 top-3 h-7 w-20 -translate-x-1/2 border-x border-b border-pitch-line/35" />
      <div className="absolute bottom-3 left-1/2 h-7 w-20 -translate-x-1/2 border-x border-t border-pitch-line/35" />

      <PitchTeamLabel game={game} team="A" />
      <PitchTeamLabel game={game} team="B" />
      <FormationHalf team="A" mode={goalkeeperMode(game, "A")} data={data} lineups={lineups.filter(lineup => lineup.team === "A")} />
      <FormationHalf team="B" mode={goalkeeperMode(game, "B")} data={data} lineups={lineups.filter(lineup => lineup.team === "B")} />
    </section>
  );
}

function PitchTeamLabel({ game, team }: { game: Game; team: TeamCode }) {
  return <div className={cn("absolute z-20 flex items-center gap-2 rounded-xl border border-pitch-line/10 bg-[#11110f]/75 px-2 py-1.5 text-pitch-line backdrop-blur", team === "A" ? "left-5 top-5" : "bottom-5 right-5 flex-row-reverse")}><TeamCrest gameId={game.id} team={team} className="h-8 w-7" /><span className="text-[10px] font-black uppercase tracking-widest">Team {team}</span></div>;
}

function FormationHalf({ team, mode, data, lineups }: { team: TeamCode; mode: "fixed" | "rotating"; data: LeagueData; lineups: GameLineup[] }) {
  const ordered = [...lineups].sort((first, second) => (first.slot_index ?? 99) - (second.slot_index ?? 99));
  const keeper = ordered.find(lineup => lineup.role === "goalkeeper");
  const outfield = ordered.filter(lineup => lineup.role !== "goalkeeper");
  const slots = mode === "fixed" ? [keeper, ...outfield.slice(0, 2), ...outfield.slice(2, 4)] : ordered;
  const fixedPositions = team === "A"
    ? ["top-[7%] left-1/2", "top-[22%] left-[28%]", "top-[22%] left-[72%]", "top-[39%] left-[28%]", "top-[39%] left-[72%]"]
    : ["bottom-[7%] left-1/2", "bottom-[22%] left-[28%]", "bottom-[22%] left-[72%]", "bottom-[39%] left-[28%]", "bottom-[39%] left-[72%]"];
  const rotatingPositions = team === "A"
    ? ["top-[15%] left-[32%]", "top-[15%] left-[68%]", "top-[36%] left-[18%]", "top-[36%] left-1/2", "top-[36%] left-[82%]"]
    : ["bottom-[15%] left-[32%]", "bottom-[15%] left-[68%]", "bottom-[36%] left-[18%]", "bottom-[36%] left-1/2", "bottom-[36%] left-[82%]"];
  const positions = mode === "fixed" ? fixedPositions : rotatingPositions;
  return <>{slots.map((lineup, index) => <div key={lineup?.id || `${team}-${index}`} className={cn("absolute z-10 -translate-x-1/2", positions[index])}><PitchPlayer playerId={lineup?.player_id} name={lineup ? playerName(data.players, lineup.player_id) : "TBD"} role={mode === "fixed" && index === 0 ? "goalkeeper" : "outfield"} team={team} pending={!lineup} /></div>)}</>;
}

function PitchPlayer({ playerId, name, role, team, pending }: { playerId?: string; name: string; role: "goalkeeper" | "outfield"; team: TeamCode; pending: boolean }) {
  const jersey = role === "goalkeeper"
    ? "/fantasy/goalkeeper-jersey.webp"
    : team === "A"
      ? "/fantasy/outfield-jersey.webp"
      : "/fantasy/team-b-outfield-jersey.webp";

  const content = (
    <>
      <div className="relative mx-auto h-12 w-12 sm:h-14 sm:w-14">
        <Image src={jersey} alt="" fill sizes="56px" className="object-contain drop-shadow-[0_7px_8px_rgba(0,0,0,.42)]" />
        <span className={cn("absolute -right-2 top-0 rounded-md border bg-[#11110f]/90 px-1 py-0.5 text-[7px] font-black uppercase tracking-wider shadow-sm", team === "A" ? "border-[#31b94e]/25 text-[#d7fadd]" : "border-[#f87171]/25 text-[#fecaca]")}>{role === "goalkeeper" ? "GK" : "OUT"}</span>
      </div>
      <div className={cn("mx-auto -mt-0.5 truncate rounded-lg border bg-[#11110f]/90 px-1.5 py-1 text-[9px] font-bold text-pitch-line shadow-lg backdrop-blur sm:text-[11px]", team === "A" ? "border-[#31b94e]/25" : "border-[#f87171]/25")}>{name}</div>
    </>
  );

  const className = cn("block w-[5.3rem] text-center transition sm:w-24", pending && "opacity-35", playerId && "hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-league-gold");
  return playerId && !pending
    ? <Link href={`/players/${playerId}`} className={className} aria-label={`View ${name}'s player profile`}>{content}</Link>
    : <div className={className}>{content}</div>;
}

function MatchFantasy({ game, data }: { game: Game; data: LeagueData }) {
  if (game.status !== "final") {
    return (
      <section className="rounded-[1.35rem] border border-league-gold/25 bg-ink-850 p-6 text-center shadow-[0_9px_24px_rgba(0,0,0,.13)] md:p-8">
        <Crown className="mx-auto text-league-gold" size={30} />
        <h2 className="mt-3 font-display text-2xl uppercase md:text-3xl">Fantasy points after full time</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-chalk/50">Fantasy points will be shown after the game ends.</p>
        <p className="mt-4 text-sm text-chalk/60">Head to <Link href="/fantasy?tab=set" className="inline-flex border-b border-league-gold font-bold text-league-gold transition hover:text-floodlight">Fantasy</Link> to set or review your team.</p>
      </section>
    );
  }

  const eligibleIds = new Set(data.players.filter(isFantasyEligible).map(player => player.id));
  const ids = [...new Set([...data.lineups.filter(lineup => lineup.game_id === game.id).map(lineup => lineup.player_id), ...data.playerStats.filter(stat => stat.game_id === game.id).map(stat => stat.player_id)])].filter(id => eligibleIds.has(id));
  const rows = ids.map(id => {
    const player = data.players.find(item => item.id === id)!;
    return calculatePlayerBreakdown({ game, player, lineups: data.lineups, events: data.events, playerStats: data.playerStats });
  }).sort((first, second) => second.points - first.points || first.playerName.localeCompare(second.playerName));

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
      <div className="border-b border-league-gold/15 px-4 py-3"><h2 className="font-display text-2xl uppercase">Fantasy points</h2><p className="text-xs text-chalk/40">Highest to lowest</p></div>
      <ol className="gold-dividers divide-y">{rows.map((row, index) => <li key={row.playerId}><Link href={`/players/${row.playerId}`} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-league-gold/[.035] focus:outline-none focus-visible:bg-league-gold/[.07]"><span className="font-mono text-xs text-chalk/35">#{index + 1}</span><div><div className="font-semibold">{row.playerName}</div><div className="text-[10px] uppercase tracking-wider text-chalk/35">Team {row.team || "—"} · {row.role === "goalkeeper" ? "GK" : "OUT"}</div></div><span className="font-mono text-xl font-bold text-league-gold">{row.points}</span></Link></li>)}</ol>
      {!rows.length ? <p className="p-8 text-center text-sm text-chalk/40">No eligible fantasy players were recorded for this game.</p> : null}
    </section>
  );
}
