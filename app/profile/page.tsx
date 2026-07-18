"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronDown, Settings } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueData } from "@/hooks/useLeagueData";
import { allTimeLeaderboard, weeklyLeaderboard } from "@/lib/scoring";
import { Game, WeeklyFantasyResult } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { Card, EmptyState, ErrorState, LoadingState, Stat } from "@/components/ui";

export default function ProfilePage() {
  const { user, profile } = useAuthProfile();
  const { data, loading, error, reload } = useLeagueData();
  const allTime = useMemo(() => allTimeLeaderboard(data), [data]);
  const me = profile ? allTime.find(r => r.userId === profile.id) : null;
  const weekly = useMemo(() => {
    if (!profile) return [];
    return data.games.filter(g => g.status === "final").sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()).map(game => ({ game, row: weeklyLeaderboard({ ...data, game }).find(r => r.userId === profile.id) })).filter(item => item.row);
  }, [data, profile]);
  if (loading) return <LoadingState label="Loading profile" cards={2} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!user || !profile) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl uppercase">Profile</h1>
          <p className="mt-2 text-chalk/60">Your account, rank, and fantasy history.</p>
        </div>
        <Link href="/settings" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-chalk/70 transition hover:border-perimeter-400/50 hover:text-chalk">
          <Settings size={18} /><span className="hidden sm:inline">Settings</span>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <Card>
          <h2 className="font-display text-4xl uppercase">{profile.username}</h2>
          <p className="mt-1 text-sm text-chalk/45">{profile.is_admin ? "Admin account" : "Fantasy account"}</p>
          <div className="mt-6 grid grid-cols-2 gap-3"><Stat label="all-time total" value={me?.points || 0} /><Stat label="rank" value={me ? `#${me.rank}` : "—"} /></div>
        </Card>
        <WeeklyHistory items={weekly} />
      </div>
    </div>
  );
}

function WeeklyHistory({ items }: { items: { game: Game; row: WeeklyFantasyResult | undefined }[] }) {
  return (
    <Card>
      <details className="group" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3"><h2 className="font-display text-3xl uppercase">Weekly picks + points</h2><ChevronDown className="transition group-open:rotate-180" /></summary>
        {!items.length ? <div className="mt-4"><EmptyState title="No fantasy history" text="After final games, your weekly results appear here." /></div> : null}
        <div className="mt-4 space-y-3">
          {items.map(({ game, row }) => row ? <details key={game.id} className="group/week rounded-2xl border border-white/10 bg-white/[0.03] p-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><div className="font-semibold">{formatDateTime(game.game_date)}</div><div className="text-sm text-chalk/45">Rank #{row.rank}</div></div><div className="flex items-center gap-3"><div className="font-mono text-2xl text-perimeter-400">{row.points}</div><ChevronDown size={16} className="transition group-open/week:rotate-180" /></div></summary><div className="mt-3 border-t border-white/10 pt-3 text-xs text-chalk/55">{row.breakdown.map(item => `${item.playerName}${item.isCaptain ? " (C)" : ""}: ${item.points}`).join(" · ")}</div></details> : null)}
        </div>
      </details>
    </Card>
  );
}
