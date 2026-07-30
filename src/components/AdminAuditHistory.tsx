"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyActionError } from "@/lib/actionErrors";
import { AdminAuditLog, Game, Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { Card, EmptyState, ErrorState, LoadingState, Pill, SecondaryButton, Select, TextInput } from "./ui";

const ACTION_LABELS: Record<string, string> = {
  lineup_replaced: "Lineup saved",
  status_changed: "Game status changed",
  final_game_reopened: "Final game reopened",
  player_archived: "Player archived",
  player_restored: "Player restored",
  players_insert: "Player created",
  players_update: "Player updated",
  games_insert: "Game created",
  games_update: "Game updated",
  games_delete: "Game deleted",
  events_insert: "Event added",
  events_update: "Event updated",
  events_delete: "Event deleted",
  game_player_stats_insert: "Player stat added",
  game_player_stats_update: "Player stat updated",
  game_player_stats_delete: "Player stat removed",
  season_created: "Season created",
  season_mode_changed: "Season mode changed",
  season_updated: "Season updated",
  wallet_adjusted: "Wallet adjusted",
  league_created: "League created",
  league_member_role_changed: "Member role changed",
  league_ownership_transferred: "League ownership transferred",
  league_member_removed: "League member removed",
  league_options_updated: "League options updated",
  league_join_code_rotated: "League code rotated",
  league_archived: "League archived"
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action.replaceAll("_", " ");
}

const FIELD_LABELS: Record<string, string> = {
  user_id: "Member",
  owner_user_id: "Owner",
  game_date: "Game date",
  potm_player_id: "Player of the match",
  fantasy_enabled: "Fantasy",
  betting_enabled: "Betting",
  betting_unlock_after_games: "Betting unlock",
  archived_at: "Archived",
  default_position: "Position",
  player_type: "Player type",
  fantasy_eligible: "Fantasy eligible",
  individual_betting_eligible: "Betting eligible"
};

const HIDDEN_FIELDS = new Set([
  "id",
  "league_id",
  "created_at",
  "updated_at"
]);

function fieldLabel(key: string) {
  return FIELD_LABELS[key]
    || key.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
}

function readableValue(key: string, value: unknown, profiles: Profile[], games: Game[]) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (key.endsWith("user_id") && typeof value === "string") {
    return profiles.find(profile => profile.id === value)?.username || "Former member";
  }
  if (key === "game_id" && typeof value === "string") {
    const game = games.find(item => item.id === value);
    return game ? formatDateTime(game.game_date) : "Game record";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatDateTime(value);
  }
  if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)) {
    return `Record ending ${value.slice(-6)}`;
  }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    return `Detailed data updated (${Object.keys(value as Record<string, unknown>).length} fields)`;
  }
  if (key === "betting_unlock_after_games") {
    return `${String(value)} final game${Number(value) === 1 ? "" : "s"}`;
  }
  return String(value).replaceAll("_", " ");
}

function AuditSnapshot({
  label,
  value,
  profiles,
  games
}: {
  label: string;
  value: AdminAuditLog["before_data"];
  profiles: Profile[];
  games: Game[];
}) {
  if (value === null) return null;
  const entries = Object.entries(value)
    .filter(([key]) => !HIDDEN_FIELDS.has(key));
  if (!entries.length) return null;
  return (
    <div className="rounded-2xl border border-league-gold/15 bg-black/20 p-4">
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-chalk/45">{label}</div>
      <dl className="mt-2 divide-y divide-league-gold/10">
        {entries.map(([key, entry]) => (
          <div key={key} className="grid gap-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,11rem)_1fr]">
            <dt className="text-xs font-semibold text-chalk/40">{fieldLabel(key)}</dt>
            <dd className="break-words text-sm text-chalk/75">{readableValue(key, entry, profiles, games)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AdminAuditHistory({ profiles, games, onCorrectGame }: { profiles: Profile[]; games: Game[]; onCorrectGame: (gameId: string) => void }) {
  const [rows, setRows] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: requestError } = await supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (requestError) {
      setError(friendlyActionError(requestError, "Audit history could not be loaded. Check the database setup and try again."));
      setRows([]);
    } else {
      setRows((data || []) as AdminAuditLog[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(() => [...new Set(rows.map(row => row.action))].sort(), [rows]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      if (action !== "all" && row.action !== action) return false;
      if (!needle) return true;
      const admin = profiles.find(profile => profile.id === row.admin_user_id)?.username || "system";
      const game = games.find(item => item.id === row.game_id);
      return [actionLabel(row.action), row.reason, admin, game ? formatDateTime(game.game_date) : null]
        .some(value => value?.toLowerCase().includes(needle));
    });
  }, [action, games, profiles, query, rows]);

  if (loading) return <LoadingState label="Loading audit history" cards={3} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl uppercase">Admin Audit History</h2>
            <p className="mt-1 text-sm text-chalk/55">The latest 200 controlled changes, newest first.</p>
          </div>
          <SecondaryButton type="button" onClick={load} className="inline-flex items-center gap-2">
            <RefreshCw size={16} /> Refresh
          </SecondaryButton>
        </div>
        {games.some(game => game.status === "final") ? (
          <div className="mt-4 rounded-2xl border border-league-gold/20 bg-league-gold/[.055] p-4 text-sm text-chalk/65">Final results stay locked. Use <strong className="text-chalk">Correct game</strong> on a game entry, give a reason, make the edit, and finalize it again.</div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px]">
          <label className="relative">
            <span className="sr-only">Search audit history</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-chalk/35" size={17} />
            <TextInput value={query} onChange={event => setQuery(event.target.value)} placeholder="Search action, admin, game, or reason" className="pl-11" />
          </label>
          <Select value={action} onChange={event => setAction(event.target.value)} aria-label="Filter by action">
            <option value="all">All actions</option>
            {actions.map(item => <option key={item} value={item}>{actionLabel(item)}</option>)}
          </Select>
        </div>
      </Card>

      {!filtered.length ? <EmptyState title="No audit entries" text={rows.length ? "No entries match the current filters." : "Admin changes will appear here after the migration is active."} /> : null}
      {filtered.map(row => {
        const admin = profiles.find(profile => profile.id === row.admin_user_id)?.username || "System / deleted admin";
        const game = games.find(item => item.id === row.game_id);
        return (
          <Card key={row.id} className="p-0">
            <details className="group p-5">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-chalk">{actionLabel(row.action)}</h3>
                      {game ? <Pill>{formatDateTime(game.game_date)}</Pill> : null}
                    </div>
                    <p className="mt-1 text-sm text-chalk/55">By {admin}{row.reason ? ` - ${row.reason}` : ""}</p>
                  </div>
                  <time className="text-xs text-chalk/45" dateTime={row.created_at}>{formatDateTime(row.created_at)}</time>
                </div>
                <div className="mt-3 text-xs font-bold uppercase tracking-wider text-league-gold group-open:hidden">View details</div>
                <div className="mt-3 hidden text-xs font-bold uppercase tracking-wider text-league-gold group-open:block">Hide details</div>
              </summary>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <AuditSnapshot label="Before" value={row.before_data} profiles={profiles} games={games} />
                <AuditSnapshot label="After" value={row.after_data} profiles={profiles} games={games} />
              </div>
              {game ? <SecondaryButton type="button" onClick={() => onCorrectGame(game.id)} className="mt-4 inline-flex items-center gap-2"><Pencil size={15} /> Correct game</SecondaryButton> : null}
            </details>
          </Card>
        );
      })}
    </div>
  );
}
