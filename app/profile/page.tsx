"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueData } from "@/hooks/useLeagueData";
import { allTimeLeaderboard, weeklyLeaderboard } from "@/lib/scoring";
import { formatDateTime } from "@/lib/utils";
import { Card, EmptyState, PrimaryButton, Stat, TextInput } from "@/components/ui";

export default function ProfilePage() {
  const { user, profile } = useAuthProfile();
  const { data, loading, error } = useLeagueData();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const allTime = useMemo(() => allTimeLeaderboard(data), [data]);
  const me = profile ? allTime.find(r => r.userId === profile.id) : null;

  const weekly = useMemo(() => {
    if (!profile) return [];
    return data.games
      .filter(g => g.status === "final")
      .sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime())
      .map(game => {
        const board = weeklyLeaderboard({ ...data, game });
        return { game, row: board.find(r => r.userId === profile.id) };
      })
      .filter(item => item.row);
  }, [data, profile]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 6) return setMessage("Password needs at least 6 characters.");
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? error.message : "Password changed.");
    if (!error) setPassword("");
  }

  if (loading) return <div>Loading profile...</div>;
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>;
  if (!user || !profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-5xl uppercase">Profile</h1>
        <p className="mt-2 text-chalk/60">Your account, rank, history, and password.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <Card>
          <h2 className="font-display text-4xl uppercase">{profile.username}</h2>
          <p className="mt-1 text-sm text-chalk/45">{profile.is_admin ? "Admin account" : "Fantasy account"}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Stat label="season total" value={me?.points || 0} />
            <Stat label="rank" value={me ? `#${me.rank}` : "—"} />
          </div>

          <form onSubmit={changePassword} className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="font-display text-2xl uppercase">Change password</h3>
            <TextInput type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" />
            <PrimaryButton>Update password</PrimaryButton>
            {message ? <p className="text-sm text-chalk/60">{message}</p> : null}
          </form>
        </Card>

        <Card>
          <h2 className="font-display text-3xl uppercase">Weekly picks + points</h2>
          {!weekly.length ? <EmptyState title="No fantasy history" text="After final games, your weekly results appear here." /> : null}
          <div className="mt-4 space-y-3">
            {weekly.map(({ game, row }) => (
              <div key={game.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{formatDateTime(game.game_date)}</div>
                    <div className="text-sm text-chalk/45">Rank #{row!.rank}</div>
                  </div>
                  <div className="font-mono text-2xl text-perimeter-400">{row!.points}</div>
                </div>
                <div className="mt-2 text-xs text-chalk/55">
                  {row!.breakdown.map(item => `${item.playerName}${item.isCaptain ? " (C)" : ""}: ${item.points}`).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
