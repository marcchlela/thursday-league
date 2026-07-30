"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Gamepad2,
  Shield,
  Smartphone,
  Trophy,
  UsersRound
} from "lucide-react";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import { supabase } from "@/lib/supabase";
import type { Game, League, Profile } from "@/lib/types";
import { AdminNotificationHistory } from "@/components/AdminNotificationHistory";
import { Card, ErrorState, LoadingState, Select } from "@/components/ui";

type PlatformLeagueStats = {
  league_id: string;
  league_name: string;
  league_slug: string;
  status: string;
  member_count: number;
  admin_count: number;
  player_count: number;
  game_count: number;
  final_game_count: number;
  fantasy_squad_count: number;
  bet_count: number;
  notification_device_count: number;
};

export default function PlatformAdminPage() {
  const router = useRouter();
  const { isPlatformAdmin, loading: contextLoading, leaguePath } = useLeagueContext();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [stats, setStats] = useState<PlatformLeagueStats[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [leagueGames, setLeagueGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tab, setTab] = useState<"overview" | "notifications">("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contextLoading && !isPlatformAdmin) router.replace(leaguePath("/"));
  }, [contextLoading, isPlatformAdmin, leaguePath, router]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let active = true;
    void Promise.all([
      supabase.from("leagues").select("*").order("created_at", { ascending: false }),
      supabase.rpc("get_platform_league_stats"),
      supabase.from("profiles").select("id, username, avatar_path").order("username")
    ]).then(([leagueResult, statsResult, profilesResult]) => {
      if (!active) return;
      if (leagueResult.error || statsResult.error) {
        setError(friendlyActionError(
          leagueResult.error || statsResult.error,
          "Platform statistics could not be loaded."
        ));
      } else {
        const leagueRows = (leagueResult.data || []) as League[];
        setLeagues(leagueRows);
        setStats((statsResult.data || []) as PlatformLeagueStats[]);
        setProfiles((profilesResult.data || []).map(profile => ({
          ...profile,
          is_admin: false
        })) as Profile[]);
        setSelectedLeagueId(current => current || leagueRows[0]?.id || "");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (!isPlatformAdmin || !selectedLeagueId) {
      setLeagueGames([]);
      return;
    }
    let active = true;
    void supabase
      .from("games")
      .select("*")
      .eq("league_id", selectedLeagueId)
      .order("game_date", { ascending: false })
      .then(result => {
        if (active && !result.error) setLeagueGames((result.data || []) as Game[]);
      });
    return () => { active = false; };
  }, [isPlatformAdmin, selectedLeagueId]);

  const selectedLeague = leagues.find(league => league.id === selectedLeagueId);
  const selectedStats = stats.find(row => row.league_id === selectedLeagueId);
  const totals = useMemo(() => stats.reduce((result, row) => ({
    leagues: result.leagues + (row.status === "active" ? 1 : 0),
    members: result.members + Number(row.member_count),
    games: result.games + Number(row.game_count),
    devices: result.devices + Number(row.notification_device_count)
  }), { leagues: 0, members: 0, games: 0, devices: 0 }), [stats]);

  if (contextLoading || loading) return <LoadingState label="Loading platform controls" cards={4} />;
  if (!isPlatformAdmin) return null;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-league-gold/65"><Shield size={14} /> Platform owner</div>
        <h1 className="mt-1 font-display text-4xl uppercase sm:text-5xl">Platform Control</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-chalk/42">App-level health, aggregate league activity, announcements, and delivery recovery. League admins cannot access this area.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={Trophy} label="Active leagues" value={totals.leagues} />
        <Metric icon={UsersRound} label="Memberships" value={totals.members} />
        <Metric icon={Gamepad2} label="Games" value={totals.games} />
        <Metric icon={Smartphone} label="Push devices" value={totals.devices} />
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/45">Inspect league</span>
            <Select value={selectedLeagueId} onChange={event => setSelectedLeagueId(event.target.value)}>
              {leagues.map(league => <option key={league.id} value={league.id}>{league.name}{league.status === "archived" ? " (archived)" : ""}</option>)}
            </Select>
          </label>
          <div className="grid grid-cols-2 rounded-xl border border-league-gold/18 bg-black/15 p-1">
            <button type="button" onClick={() => setTab("overview")} className={tab === "overview" ? "rounded-lg bg-league-gold/[.1] px-4 py-2 text-sm font-bold text-league-gold" : "rounded-lg px-4 py-2 text-sm font-bold text-chalk/40"}>Overview</button>
            <button type="button" onClick={() => setTab("notifications")} className={tab === "notifications" ? "rounded-lg bg-league-gold/[.1] px-4 py-2 text-sm font-bold text-league-gold" : "rounded-lg px-4 py-2 text-sm font-bold text-chalk/40"}>Notifications</button>
          </div>
        </div>
      </Card>

      {tab === "overview" && selectedLeague && selectedStats ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-display text-3xl uppercase">{selectedLeague.name}</h2><p className="mt-1 text-xs text-chalk/35">/{selectedLeague.slug} · {selectedLeague.status}</p></div>
            <span className="rounded-full border border-league-gold/20 bg-league-gold/[.06] px-3 py-1 text-xs font-bold text-league-gold">{selectedStats.admin_count} admin{Number(selectedStats.admin_count) === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SmallMetric label="Members" value={selectedStats.member_count} />
            <SmallMetric label="Roster" value={selectedStats.player_count} />
            <SmallMetric label="Games final" value={`${selectedStats.final_game_count}/${selectedStats.game_count}`} />
            <SmallMetric label="Fantasy squads" value={selectedStats.fantasy_squad_count} />
            <SmallMetric label="Bets placed" value={selectedStats.bet_count} />
            <SmallMetric label="Push devices" value={selectedStats.notification_device_count} />
            <SmallMetric label="Fantasy" value={selectedLeague.fantasy_enabled ? "On" : "Off"} />
            <SmallMetric label="Betting" value={selectedLeague.betting_enabled ? "On" : "Off"} />
          </div>
        </Card>
      ) : null}

      {tab === "notifications" && selectedLeagueId ? (
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-chalk/45"><BellRing size={16} /> {selectedLeague?.name}</div>
          <AdminNotificationHistory leagueId={selectedLeagueId} profiles={profiles} games={leagueGames} />
        </div>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: number }) {
  return <Card className="p-4"><div className="flex items-center justify-between gap-2"><span className="font-mono text-3xl">{value}</span><Icon className="text-league-gold" size={19} /></div><div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-chalk/40">{label}</div></Card>;
}

function SmallMetric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl border border-league-gold/15 bg-black/15 p-3"><div className="font-mono text-xl font-bold">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-chalk/35">{label}</div></div>;
}
