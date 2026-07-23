"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, BellRing, CalendarClock, Gamepad2, RefreshCw, Smartphone, Trophy, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LeagueData } from "@/lib/types";
import { Card } from "./ui";

type NotificationStats = {
  notification_users: number;
  notification_devices: number;
};

const emptyNotificationStats: NotificationStats = {
  notification_users: 0,
  notification_devices: 0
};

export function AdminStatsPanel({ data }: { data: LeagueData }) {
  const [notificationStats, setNotificationStats] = useState(emptyNotificationStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotificationStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: result, error: statsError } = await supabase.rpc("get_admin_notification_stats");

    if (statsError) {
      setError("Notification totals could not be loaded.");
      setLoading(false);
      return;
    }

    const stats = result as Partial<NotificationStats> | null;
    setNotificationStats({
      notification_users: Number(stats?.notification_users) || 0,
      notification_devices: Number(stats?.notification_devices) || 0
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadNotificationStats();
  }, [loadNotificationStats]);

  const metrics = useMemo(() => {
    const activePlayers = data.players.filter(player => player.active && !player.archived_at).length;
    const archivedPlayers = data.players.length - activePlayers;
    const completedGames = data.games.filter(game => game.status === "final").length;
    const openGames = data.games.length - completedGames;
    const fantasyManagers = new Set(data.squads.map(squad => squad.user_id)).size;
    const notificationCoverage = data.profiles.length
      ? Math.round((notificationStats.notification_users / data.profiles.length) * 100)
      : 0;

    return [
      { label: "Registered users", value: data.profiles.length, detail: "League accounts", icon: Users },
      { label: "Notifications on", value: notificationStats.notification_users, detail: `${notificationCoverage}% of users`, icon: BellRing, remote: true },
      { label: "Push devices", value: notificationStats.notification_devices, detail: "Subscribed devices", icon: Smartphone, remote: true },
      { label: "Active players", value: activePlayers, detail: "Available for lineups", icon: Gamepad2 },
      { label: "Archived players", value: archivedPlayers, detail: "History preserved", icon: Archive },
      { label: "Games played", value: completedGames, detail: `${data.games.length} total games`, icon: Trophy },
      { label: "Open games", value: openGames, detail: "Upcoming, draft or live", icon: CalendarClock },
      { label: "Fantasy managers", value: fantasyManagers, detail: `${data.squads.length} saved squads`, icon: Users }
    ];
  }, [data, notificationStats]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl uppercase">League overview</h2>
          <p className="mt-1 text-sm text-chalk/55">Users, notification adoption, roster activity, games, and fantasy participation.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadNotificationStats()}
          disabled={loading}
          className="rounded-xl border border-league-gold/15 bg-black/15 p-2 text-chalk/55 transition hover:border-league-gold/50 hover:text-league-gold disabled:opacity-40"
          aria-label="Refresh notification statistics"
          title="Refresh notification statistics"
        >
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.map(metric => {
          const Icon = metric.icon;
          const showSkeleton = metric.remote && loading;
          return (
            <div key={metric.label} className="rounded-2xl border border-league-gold/15 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-2">
                {showSkeleton ? <span className="skeleton-shimmer h-8 w-12 rounded-lg" /> : <span className="font-mono text-3xl text-chalk">{metric.value}</span>}
                <Icon size={19} className="text-league-gold" />
              </div>
              <div className="mt-3 text-xs font-bold uppercase tracking-wider text-chalk/70">{metric.label}</div>
              <div className="mt-1 text-xs text-chalk/40">{showSkeleton ? "Loading..." : metric.detail}</div>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100" role="alert">
          <span>{error} Run the latest Supabase migration, then retry.</span>
          <button type="button" onClick={() => void loadNotificationStats()} className="shrink-0 font-bold underline underline-offset-4">Retry</button>
        </div>
      ) : null}
    </Card>
  );
}
