"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Crown, X } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueData } from "@/hooks/useLeagueData";
import { calculateScore, weeklyLeaderboard } from "@/lib/scoring";
import { PlayerBreakdown } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingState, Modal } from "@/components/ui";
import { TeamCrest } from "@/components/TeamCrest";
import { AccountAvatar } from "@/components/AccountAvatar";

const goalkeeperFormation = [
  { x: 25, y: 27 },
  { x: 75, y: 27 },
  { x: 29, y: 56 },
  { x: 71, y: 56 },
  { x: 50, y: 84 }
];

const outfieldFormation = [
  { x: 50, y: 18 },
  { x: 23, y: 43 },
  { x: 77, y: 43 },
  { x: 31, y: 70 },
  { x: 69, y: 70 }
];

export default function FantasySquadHistoryPage() {
  const params = useParams<{ gameId: string; userId: string }>();
  const { user } = useAuthProfile();
  const { data, loading, error, reload } = useLeagueData();
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerBreakdown | null>(null);

  if (loading) return <LoadingState label="Loading fantasy squad" cards={2} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const game = data.games.find(item => item.id === params.gameId);
  if (!game) return <EmptyState title="Game not found" text="This fantasy week may no longer be available." />;

  const board = weeklyLeaderboard({ ...data, game });
  const row = board.find(item => item.userId === params.userId);
  if (!row) return <EmptyState title="Squad not found" text="This manager did not submit a squad for this game." />;

  const squadPicks = data.picks.filter(pick => pick.squad_id === row.squadId);
  const hasGoalkeeper = squadPicks.some(pick => pick.role === "goalkeeper");
  const positions = hasGoalkeeper ? goalkeeperFormation : outfieldFormation;
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const score = calculateScore(
    data.events.filter(event => event.game_id === game.id),
    lineups,
    data.playerStats.filter(stat => stat.game_id === game.id)
  );
  const managerProfile = data.profiles.find(profile => profile.id === row.userId);

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <Link href={`/fantasy?tab=history&game=${game.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-chalk/45 transition hover:text-league-gold"><ArrowLeft size={16} /> Back to Fantasy history</Link>

      <header className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-league-gold/15 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <AccountAvatar profile={managerProfile} name={row.username} className="h-11 w-11 text-sm sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/70">{row.userId === user?.id ? "Your weekly squad" : "Manager squad"}</div>
              <h1 className="mt-1 truncate font-display text-3xl uppercase sm:text-4xl">{row.username}&apos;s picks</h1>
              <p className="mt-1 text-xs text-chalk/55">{formatDateTime(game.game_date)}</p>
            </div>
          </div>
          <div className="text-right"><div className="text-[9px] font-black uppercase tracking-widest text-chalk/30">Total points</div><div className="font-mono text-4xl font-black text-league-gold">{row.points}</div></div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:px-5">
          <SquadMatchTeam gameId={game.id} team="A" />
          <span className="font-mono text-xl font-black">{score.A}<span className="px-1.5 text-chalk/25">–</span>{score.B}</span>
          <SquadMatchTeam gameId={game.id} team="B" reverse />
        </div>
      </header>

      <section className="relative mx-auto aspect-[4/5] w-full min-w-0 max-w-3xl overflow-hidden rounded-[1.7rem] border-2 border-league-gold/40 bg-[#0b3e22] shadow-[0_16px_38px_rgba(0,0,0,.25),inset_0_0_45px_rgba(0,0,0,.24)] sm:min-h-[540px]" aria-label={`${row.username}'s fantasy team`}>
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,.025)_0%,rgba(255,255,255,.025)_10%,rgba(0,0,0,.025)_10%,rgba(0,0,0,.025)_20%)]" />
        <div className="absolute inset-3 rounded-[1.25rem] border border-pitch-line/45" />
        <div className="absolute inset-x-3 top-1/2 border-t border-pitch-line/45" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-pitch-line/45 md:h-28 md:w-28" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pitch-line/60" />
        <div className="absolute left-1/2 top-3 h-16 w-36 -translate-x-1/2 rounded-b-2xl border-x border-b border-pitch-line/45 md:h-20 md:w-44" />
        <div className="absolute bottom-3 left-1/2 h-16 w-36 -translate-x-1/2 rounded-t-2xl border-x border-t border-pitch-line/45 md:h-20 md:w-44" />

        {row.breakdown.map(item => {
          const pick = squadPicks.find(squadPick => squadPick.player_id === item.playerId);
          const slot = Math.min(Math.max(pick?.slot_index ?? 0, 0), 4);
          const position = positions[slot];
          const role = item.role || pick?.role || "outfield";

          return (
            <button
              key={item.playerId}
              type="button"
              onClick={() => setSelectedPlayer(item)}
              className="group absolute z-10 w-[5.8rem] -translate-x-1/2 -translate-y-1/2 text-center transition hover:-translate-y-[54%] hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:w-28"
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              aria-label={`${item.playerName}, ${item.points} points. Open points breakdown.`}
            >
              <span className="relative mx-auto block h-[4.9rem] w-[4.9rem] sm:h-[5.8rem] sm:w-[5.8rem]">
                <Image src={role === "goalkeeper" ? "/fantasy/goalkeeper-jersey.webp" : "/fantasy/outfield-jersey.webp"} alt="" fill sizes="96px" className="object-contain drop-shadow-[0_9px_9px_rgba(0,0,0,.4)]" />
                <span className="absolute -bottom-1 -left-1 rounded-lg border border-[#daa520]/30 bg-[#11110f]/95 px-1.5 py-1 font-mono text-[10px] font-black text-[#daa520] shadow-lg sm:text-xs">{item.points} pts</span>
                {item.isCaptain ? <span className="absolute -right-1 top-0 grid h-7 w-7 place-items-center rounded-full border-2 border-[#0b3e22] bg-[#daa520] text-[#11110f] shadow-lg"><Crown size={14} /></span> : null}
              </span>
              <span className="mx-auto -mt-1 block max-w-full truncate rounded-lg border border-pitch-line/10 bg-[#11110f]/90 px-2 py-1 text-[10px] font-bold text-pitch-line shadow-lg backdrop-blur sm:text-xs">{item.playerName}</span>
            </button>
          );
        })}
      </section>

      <p className="text-center text-xs text-chalk/35">Tap any player to see how their points were calculated.</p>

      <Modal open={!!selectedPlayer} title={selectedPlayer?.playerName || "Player points"} onClose={() => setSelectedPlayer(null)}>
        {selectedPlayer ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/70">{selectedPlayer.role === "goalkeeper" ? "Goalkeeper" : "Outfield"}{selectedPlayer.isCaptain ? " · Captain" : ""}</div>
                <h2 className="mt-1 font-display text-3xl uppercase">{selectedPlayer.playerName}</h2>
              </div>
              <button type="button" onClick={() => setSelectedPlayer(null)} className="rounded-xl border border-chalk/[.07] p-2 text-chalk/40 transition hover:bg-chalk/[.04] hover:text-chalk" aria-label="Close player points"><X size={17} /></button>
            </div>
            <div className="mt-5 space-y-2">
              {selectedPlayer.lines.map((line, index) => <div key={`${line}-${index}`} className="flex items-center gap-3 rounded-xl border border-league-gold/10 bg-black/15 px-3 py-2.5 text-sm text-chalk/70"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-league-gold/70" /><span>{line}</span></div>)}
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-league-gold/15 pt-4">
              <div><div className="text-[9px] font-black uppercase tracking-widest text-chalk/30">Player total</div>{selectedPlayer.isCaptain ? <div className="mt-1 text-xs text-chalk/45">{selectedPlayer.pointsBeforeCaptain} before captain multiplier</div> : null}</div>
              <span className="font-mono text-3xl font-black text-league-gold">{selectedPlayer.points} pts</span>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

function SquadMatchTeam({ gameId, team, reverse = false }: { gameId: string; team: "A" | "B"; reverse?: boolean }) {
  return <div className={`flex min-w-0 items-center gap-2 ${reverse ? "flex-row-reverse text-right" : ""}`}><TeamCrest gameId={gameId} team={team} className="h-9 w-8 shrink-0" /><span className="truncate text-xs font-bold">Team {team}</span></div>;
}
