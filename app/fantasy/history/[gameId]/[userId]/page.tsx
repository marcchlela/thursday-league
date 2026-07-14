"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Crown, X } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueData } from "@/hooks/useLeagueData";
import { weeklyLeaderboard } from "@/lib/scoring";
import { PlayerBreakdown } from "@/lib/types";
import { Card, EmptyState, Pill, Stat } from "@/components/ui";

export default function FantasySquadHistoryPage() {
  const params = useParams<{ gameId: string; userId: string }>();
  const { user } = useAuthProfile();
  const { data, loading, error } = useLeagueData();
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerBreakdown | null>(null);
  if (loading) return <div>Loading fantasy squad...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;
  const game = data.games.find(g => g.id === params.gameId);
  if (!game) return <EmptyState title="Game not found" text="This fantasy week may no longer be available." />;
  const board = weeklyLeaderboard({ ...data, game });
  const row = board.find(item => item.userId === params.userId);
  if (!row) return <EmptyState title="Squad not found" text="This manager did not submit a squad for this game." />;
  const squadPicks = data.picks.filter(pick => pick.squad_id === row.squadId);
  const positions = ["bottom-[8%] left-1/2", "bottom-[34%] left-[28%]", "bottom-[34%] left-[72%]", "top-[18%] left-[28%]", "top-[18%] left-[72%]"];

  return <div className="space-y-6">
    <Link href="/fantasy" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-chalk/70 transition hover:text-chalk"><ArrowLeft size={16} /> Back to Fantasy history</Link>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><Pill className={row.userId === user?.id ? "border-floodlight/50 bg-floodlight/10 text-floodlight" : "border-perimeter-400/50 bg-perimeter-400/10 text-perimeter-400"}>{row.userId === user?.id ? "Your squad" : "Viewing manager"}</Pill><h1 className="mt-2 font-display text-5xl uppercase">{row.username}'s squad</h1></div><Stat label="weekly points" value={row.points} /></div>

    <div className="grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
      <Card><h2 className="font-display text-3xl uppercase">Weekly leaderboard</h2><div className="mt-4 space-y-2">{board.map(item => {
        const isSelected = item.userId === row.userId;
        const isMe = item.userId === user?.id;
        return <Link key={item.userId} href={`/fantasy/history/${game.id}/${item.userId}`} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3 transition ${isSelected ? "border-perimeter-400/70 bg-perimeter-400/15 ring-1 ring-perimeter-400/30" : isMe ? "border-floodlight/50 bg-floodlight/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}><span className="font-mono text-sm">#{item.rank}</span><span className="font-semibold">{item.username}{isMe ? " · you" : ""}</span><span className="font-mono text-xl">{item.points}</span></Link>;
      })}</div></Card>

      <div className="relative min-h-[610px] overflow-hidden rounded-[2rem] border-2 border-white/40 bg-turf shadow-glow">
        <div className="absolute inset-x-0 top-0 border-t-2 border-white/50" />
        <div className="absolute left-1/2 top-0 h-28 w-52 -translate-x-1/2 border-x-2 border-b-2 border-white/50" />
        <div className="absolute inset-x-0 bottom-0 border-t-2 border-white/50" />
        <div className="absolute bottom-0 left-1/2 h-36 w-36 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white/50" />
        {row.breakdown.map(item => {
          const pick = squadPicks.find(p => p.player_id === item.playerId);
          const slot = Math.min(Math.max(pick?.slot_index ?? 0, 0), 4);
          return <button key={item.playerId} onClick={() => setSelectedPlayer(item)} className={`absolute ${positions[slot]} z-10 w-32 -translate-x-1/2 rounded-2xl border bg-ink-900/90 px-2 py-3 text-center shadow-lg transition hover:-translate-y-1 hover:border-perimeter-400 ${item.isCaptain ? "border-floodlight ring-2 ring-floodlight/30" : "border-white/20"}`}><div className="truncate font-bold">{item.playerName}</div>{item.isCaptain ? <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-black uppercase text-floodlight"><Crown size={11} /> Captain</div> : null}<div className="absolute bottom-1 right-2 font-mono text-sm font-black text-perimeter-400">{item.points}</div></button>;
        })}
      </div>
    </div>

    {selectedPlayer ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 px-4 backdrop-blur-sm" onClick={() => setSelectedPlayer(null)}><div className="w-full max-w-md rounded-3xl border border-perimeter-400/35 bg-ink-900 p-5 shadow-glow" onClick={event => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><Pill>{selectedPlayer.role === "goalkeeper" ? "Goalkeeper" : "Outfield"}</Pill><h2 className="mt-2 font-display text-4xl uppercase">{selectedPlayer.playerName}</h2></div><button onClick={() => setSelectedPlayer(null)} className="rounded-xl border border-white/10 p-2 text-chalk/60 hover:text-chalk"><X size={18} /></button></div><div className="mt-5 space-y-2">{selectedPlayer.lines.map((line, index) => <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-chalk/70">{line}</div>)}</div><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4"><span className="font-bold uppercase tracking-wider text-chalk/50">Total</span><span className="font-mono text-3xl text-perimeter-400">{selectedPlayer.points}</span></div></div></div> : null}
  </div>;
}
