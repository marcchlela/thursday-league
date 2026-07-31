"use client";

import { LeagueLink as Link } from "@/components/LeagueLink";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronDown, Crown, ShieldCheck, Shirt, TrendingUp, Trophy } from "lucide-react";
import { FaFutbol } from "react-icons/fa6";
import { GiGoalKeeper, GiSoccerKick } from "react-icons/gi";
import { MdOutlineReplay } from "react-icons/md";
import { useLeagueData } from "@/hooks/useLeagueData";
import { calculatePlayerBreakdown, calculateScore, careerStats, otherTeam } from "@/lib/scoring";
import { isFantasyEligible, isGuestPlayer, isIndividualBettingEligible } from "@/lib/playerEligibility";
import { Game, LeagueData, Player, TeamCode } from "@/lib/types";
import { cn, currentSeason, formatDateTime } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { EmptyState, ErrorState, Select } from "@/components/ui";

export default function PlayerDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error, reload } = useLeagueData();
  const [seasonScope, setSeasonScope] = useState("current");
  const [showAllMatches, setShowAllMatches] = useState(false);
  const player = data.players.find(item => item.id === params.id);
  const activeSeason = useMemo(() => currentSeason(data), [data]);

  if (loading) return <PlayerDetailSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!player) return <EmptyState title="Player not found" text="This player may have been removed from the roster." />;

  const seasonId = seasonScope === "current" ? activeSeason?.id : seasonScope === "all" ? null : seasonScope;
  const scopedGames = seasonId ? data.games.filter(game => game.season_id === seasonId) : data.games;
  const stats = careerStats({ player, games: scopedGames, lineups: data.lineups, events: data.events, playerStats: data.playerStats });
  const appearances = playerAppearances(player, scopedGames, data);
  const fantasyEligible = isFantasyEligible(player);
  const bettingEligible = isIndividualBettingEligible(player);
  const guest = isGuestPlayer(player);
  const fantasyPoints = fantasyEligible
    ? appearances.reduce((total, performance) => total + performance.fantasyPoints, 0)
    : 0;
  const potmAwards = appearances.filter(performance => performance.potm).length;
  const record = appearances.reduce((total, performance) => {
    total[performance.result] += 1;
    return total;
  }, { W: 0, D: 0, L: 0 });
  const recentForm = appearances.slice(0, 5).reverse();
  const recent = showAllMatches ? appearances : appearances.slice(0, 5);
  const contributions = stats.goals + stats.assists;

  return (
    <div className="mx-auto max-w-4xl space-y-4 md:space-y-5">
      <Link href="/players" className="inline-flex items-center gap-1.5 text-xs font-bold text-chalk/40 transition hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">
        <ArrowLeft size={14} />
        All players
      </Link>

      <section className="relative overflow-hidden rounded-[1.45rem] border border-league-gold/30 bg-ink-850 p-4 shadow-[0_10px_28px_rgba(0,0,0,.16)] sm:p-5">
        <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full border-[22px] border-league-gold/[.045]" />
        <div className="relative flex items-center gap-4">
          <PlayerAvatar name={player.name} className="h-24 w-24 text-3xl sm:h-28 sm:w-28 sm:text-4xl" />
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/60">Player profile</div>
            <h1 className="mt-1 truncate font-display text-4xl uppercase sm:text-5xl">{player.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-league-gold/20 bg-league-gold/[.055] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-league-gold">{player.default_position === "goalkeeper" ? "Goalkeeper" : "Outfield"}</span>
              {guest ? <span className="rounded-full border border-chalk/10 bg-chalk/[.035] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-chalk/40">Guest player</span> : null}
              <span className={cn("rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider", player.active && !player.archived_at ? "border-turf-400/20 bg-turf-400/[.055] text-turf-400" : "border-chalk/[.07] bg-chalk/[.025] text-chalk/40")}>{player.archived_at ? "Archived" : player.active ? "Active roster" : "Inactive"}</span>
            </div>
          </div>
        </div>
      </section>

      {guest || !fantasyEligible || !bettingEligible ? (
        <section className="rounded-[1.2rem] border border-league-gold/20 bg-league-gold/[.04] p-4 text-sm leading-relaxed text-chalk/50">
          Match appearances and official statistics remain visible. {fantasyEligible ? "Fantasy selection is enabled." : "The player is excluded from Fantasy selection and scoring."} {bettingEligible ? "Individual betting markets are enabled." : "Individual betting markets are disabled."}
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-[1.2rem] border border-league-gold/25 bg-ink-850 p-4 shadow-[0_7px_20px_rgba(0,0,0,.1)] sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-sm font-semibold">Statistics period</div><div className="mt-0.5 text-xs text-chalk/35">Switch between season form and the complete career</div></div>
        <Select className="rounded-xl border-league-gold/15 py-2.5 sm:w-64" value={seasonScope} onChange={event => setSeasonScope(event.target.value)}>
          <option value="current">{activeSeason ? `${activeSeason.name} · current season` : "Current season"}</option>
          <option value="all">All-time</option>
          {data.seasons.filter(season => season.id !== activeSeason?.id).map(season => <option key={season.id} value={season.id}>{season.name}</option>)}
        </Select>
      </section>

      <section className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-league-gold/25 bg-ink-850 p-4 shadow-[0_7px_20px_rgba(0,0,0,.1)] sm:px-5">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/60">Recent form</div>
          <div className="mt-1 text-xs text-chalk/35">{recentForm.length ? `Last ${recentForm.length} · oldest to latest` : "No completed appearances"}</div>
        </div>
        {recentForm.length ? (
          <ol className="flex shrink-0 items-center gap-1.5 sm:gap-2" aria-label={`Recent form: ${recentForm.map(performance => performance.result).join(", ")}`}>
            {recentForm.map(performance => (
              <li key={performance.game.id}>
                <Link
                  href={`/games/${performance.game.id}`}
                  title={`${performance.result === "W" ? "Win" : performance.result === "L" ? "Loss" : "Draw"} · ${formatDateTime(performance.game.game_date)}`}
                  aria-label={`${performance.result === "W" ? "Win" : performance.result === "L" ? "Loss" : "Draw"} on ${formatDateTime(performance.game.game_date)}. Open match details.`}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full border font-mono text-[11px] font-black shadow-[0_4px_10px_rgba(0,0,0,.16)] transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:h-9 sm:w-9 sm:text-xs",
                    performance.result === "W"
                      ? "border-turf-400/35 bg-turf-400/15 text-turf-100"
                      : performance.result === "L"
                        ? "border-red-400/35 bg-red-400/15 text-red-200"
                        : "border-chalk/15 bg-chalk/[.07] text-chalk/60"
                  )}
                >
                  {performance.result}
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
        <div className="border-b border-league-gold/15 px-4 py-3.5 sm:px-5"><div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/60">Official totals</div><h2 className="mt-0.5 font-display text-2xl uppercase">Career statistics</h2></div>
        <div className="grid grid-cols-3 gap-px bg-league-gold/10">
          <PlayerStat value={stats.appearances} label="Appearances" icon={CalendarDays} />
          <PlayerStat value={stats.goals} label="Goals" icon={FaFutbol} />
          <PlayerStat value={stats.assists} label="Assists" icon={GiSoccerKick} />
          <PlayerStat value={stats.saves} label="Saves" icon={GiGoalKeeper} />
          <PlayerStat value={stats.cleanSheets} label="Clean sheets" icon={ShieldCheck} muted={stats.cleanSheets === 0 && player.default_position !== "goalkeeper"} />
          <PlayerStat value={stats.ownGoals} label="Own goals" icon={MdOutlineReplay} warning={stats.ownGoals > 0} />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <SummaryCard icon={Shirt} value={fantasyPoints} label="Player Fantasy score" />
        <SummaryCard icon={Crown} value={potmAwards} label="POTM awards" gold />
        <SummaryCard icon={Trophy} value={`${record.W}-${record.D}-${record.L}`} label="W-D-L record" />
      </div>

      <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
        <div className="flex items-center gap-3 border-b border-league-gold/15 px-4 py-3.5 sm:px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-turf-400/20 bg-turf-400/[.045] text-turf-400"><TrendingUp size={18} /></span>
          <div><div className="text-[8px] font-black uppercase tracking-[.17em] text-chalk/28">Efficiency</div><h2 className="font-display text-2xl uppercase">Performance rates</h2></div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-league-gold/10">
          <RateStat value={rate(stats.goals, stats.appearances)} label="Goals / game" />
          <RateStat value={rate(contributions, stats.appearances)} label="G+A / game" />
          <RateStat value={rate(fantasyPoints, appearances.length)} label="Fantasy / game" />
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
        <div className="border-b border-league-gold/15 px-4 py-3.5 sm:px-5"><div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/60">Match log</div><h2 className="mt-0.5 font-display text-2xl uppercase">Recent performances</h2></div>
        {recent.length ? (
          <ol className="divide-y divide-league-gold/18">
            {recent.map(performance => <PerformanceRow key={performance.game.id} performance={performance} />)}
          </ol>
        ) : <p className="px-4 py-10 text-center text-sm text-chalk/35">No completed appearances in this period.</p>}
        {appearances.length > 5 ? (
          <button type="button" onClick={() => setShowAllMatches(current => !current)} aria-expanded={showAllMatches} className="flex w-full items-center justify-center gap-2 border-t border-league-gold/25 px-4 py-3 text-xs font-bold text-chalk/40 transition hover:bg-league-gold/[.04] hover:text-league-gold">
            {showAllMatches ? "Show recent 5" : `View all ${appearances.length} matches`}
            <ChevronDown size={15} className={cn("transition", showAllMatches && "rotate-180")} />
          </button>
        ) : null}
      </section>
    </div>
  );
}

type Performance = ReturnType<typeof playerAppearances>[number];

function playerAppearances(player: Player, games: Game[], data: LeagueData) {
  return games
    .filter(game => game.status === "final")
    .filter(game => data.lineups.some(lineup => lineup.game_id === game.id && lineup.player_id === player.id) || data.playerStats.some(stat => stat.game_id === game.id && stat.player_id === player.id))
    .sort((first, second) => new Date(second.game_date).getTime() - new Date(first.game_date).getTime())
    .map(game => {
      const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
      const events = data.events.filter(event => event.game_id === game.id);
      const playerStats = data.playerStats.filter(stat => stat.game_id === game.id);
      const lineup = lineups.find(item => item.player_id === player.id);
      const manual = playerStats.find(item => item.player_id === player.id);
      const team = (lineup?.team || manual?.team || "A") as TeamCode;
      const role = lineup?.role || manual?.role || player.default_position;
      const score = calculateScore(events, lineups, playerStats);
      const goals = events.filter(event => event.event_type === "goal" && event.player_id === player.id).length + (manual?.goals || 0);
      const assists = events.filter(event => event.event_type === "goal" && event.assist_player_id === player.id).length + (manual?.assists || 0);
      const saves = manual?.saves || 0;
      const ownGoals = events.filter(event => event.event_type === "own_goal" && event.player_id === player.id).length + (manual?.own_goals || 0);
      const result = score[team] === score[otherTeam(team)] ? "D" : score[team] > score[otherTeam(team)] ? "W" : "L";
      const breakdown = calculatePlayerBreakdown({ game, player, lineups: data.lineups, events: data.events, playerStats: data.playerStats });
      return { game, team, role, score, goals, assists, saves, ownGoals, result: result as "W" | "D" | "L", fantasyPoints: breakdown.points, potm: game.potm_player_id === player.id };
    });
}

function PlayerStat({ value, label, icon: Icon, muted = false, warning = false }: { value: number | string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; muted?: boolean; warning?: boolean }) {
  return (
    <div className={cn("bg-ink-850 px-2 py-4 text-center sm:p-5", muted && "opacity-35")}>
      <Icon size={16} className={cn("mx-auto", warning ? "text-red-300" : "text-league-gold/65")} />
      <div className={cn("mt-2 font-mono text-2xl font-black sm:text-3xl", warning && "text-red-300")}>{value}</div>
      <div className="mt-1 text-[7px] font-black uppercase tracking-[.13em] text-chalk/28 sm:text-[9px]">{label}</div>
    </div>
  );
}

function SummaryCard({ icon: Icon, value, label, gold = false }: { icon: React.ComponentType<{ size?: number; className?: string }>; value: number | string; label: string; gold?: boolean }) {
  return (
    <section className="min-w-0 rounded-[1.2rem] border border-league-gold/25 bg-ink-850 p-3 text-center shadow-[0_7px_20px_rgba(0,0,0,.12)] sm:p-4">
      <Icon size={18} className={cn("mx-auto", gold ? "text-league-gold" : "text-turf-400")} />
      <div className={cn("mt-2 truncate font-mono text-xl font-black sm:text-2xl", gold && "text-league-gold")}>{value}</div>
      <div className="mt-1 text-[7px] font-black uppercase tracking-[.11em] text-chalk/28 sm:text-[9px]">{label}</div>
    </section>
  );
}

function RateStat({ value, label }: { value: string; label: string }) {
  return <div className="bg-ink-850 p-4 text-center sm:p-5"><div className="font-mono text-xl font-black text-turf-400 sm:text-2xl">{value}</div><div className="mt-1 text-[7px] font-black uppercase tracking-[.12em] text-chalk/28 sm:text-[9px]">{label}</div></div>;
}

function PerformanceRow({ performance }: { performance: Performance }) {
  return (
    <li>
      <Link href={`/games/${performance.game.id}`} className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 transition hover:bg-league-gold/[.04] focus:outline-none focus-visible:bg-league-gold/[.06] sm:px-5">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl border font-mono text-xs font-black", performance.result === "W" ? "border-turf-400/25 bg-turf-400/[.07] text-turf-400" : performance.result === "L" ? "border-red-400/25 bg-red-400/[.07] text-red-300" : "border-league-gold/20 bg-league-gold/[.055] text-league-gold")}>{performance.result}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">Team {performance.team} · {performance.score.A}–{performance.score.B}</span>{performance.potm ? <Crown size={13} className="shrink-0 text-league-gold" aria-label="Player of the Match" /> : null}</div>
          <div className="mt-0.5 truncate text-[10px] text-chalk/32">{formatDateTime(performance.game.game_date)} · {performance.role === "goalkeeper" ? "GK" : "OUT"}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px] font-bold">
            {performance.goals ? <span className="text-turf-400">{performance.goals}G</span> : null}
            {performance.assists ? <span className="text-turf-400">{performance.assists}A</span> : null}
            {performance.saves ? <span className="text-league-gold">{performance.saves} saves</span> : null}
            {performance.ownGoals ? <span className="text-red-300">{performance.ownGoals} OG</span> : null}
            {!performance.goals && !performance.assists && !performance.saves && !performance.ownGoals ? <span className="text-chalk/25">Appearance</span> : null}
          </div>
        </div>
        <div className="text-right"><div className="font-mono text-xl font-black text-league-gold">{performance.fantasyPoints}</div><div className="text-[7px] font-black uppercase tracking-wider text-chalk/25">Fantasy pts</div></div>
      </Link>
    </li>
  );
}

function rate(value: number, appearances: number) {
  return appearances ? (value / appearances).toFixed(2) : "0.00";
}

function PlayerDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4" role="status" aria-label="Loading player profile">
      <div className="skeleton-shimmer h-4 w-24 rounded" />
      <div className="flex min-h-36 items-center gap-4 rounded-[1.45rem] border border-league-gold/20 bg-ink-850 p-4"><div className="skeleton-shimmer h-24 w-24 rounded-full" /><div className="flex-1"><div className="skeleton-shimmer h-3 w-24 rounded" /><div className="skeleton-shimmer mt-3 h-10 w-56 max-w-full rounded-lg" /><div className="skeleton-shimmer mt-3 h-6 w-32 rounded-full" /></div></div>
      <div className="skeleton-shimmer h-20 rounded-[1.2rem] border border-league-gold/15" />
      <div className="flex h-[4.5rem] items-center justify-between rounded-[1.2rem] border border-league-gold/15 bg-ink-850 px-4"><div className="skeleton-shimmer h-8 w-24 rounded-lg" /><div className="flex gap-2">{Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton-shimmer h-8 w-8 rounded-full" />)}</div></div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[1.35rem] border border-league-gold/20">{Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-shimmer h-28" />)}</div>
      <div className="grid grid-cols-3 gap-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="skeleton-shimmer h-28 rounded-[1.2rem] border border-league-gold/15" />)}</div>
      <span className="sr-only">Loading player profile</span>
    </div>
  );
}
