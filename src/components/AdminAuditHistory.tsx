"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
  season_updated: "Season updated"
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action.replaceAll("_", " ");
}

function JsonSnapshot({ label, value }: { label: string; value: AdminAuditLog["before_data"] }) {
  if (value === null) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-chalk/45">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-2xl border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-chalk/70">
        {JSON.stringify(value, null, 2)}
      </pre>
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
      setError(`${requestError.message}. Make sure the 20260719 integrity migration has been run in Supabase.`);
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
        <div className="mt-4 rounded-2xl border border-perimeter-400/20 bg-perimeter-400/[0.07] p-4 text-sm text-chalk/65">Final results stay locked. Use <strong className="text-chalk">Correct game</strong> below, reopen the result with a reason, make the edits in Games, then finalize it again. Every edit keeps that reason in this history.</div>
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
                <div className="mt-3 text-xs font-bold uppercase tracking-wider text-perimeter-400 group-open:hidden">View details</div>
                <div className="mt-3 hidden text-xs font-bold uppercase tracking-wider text-perimeter-400 group-open:block">Hide details</div>
              </summary>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <JsonSnapshot label="Before" value={row.before_data} />
                <JsonSnapshot label="After" value={row.after_data} />
              </div>
              {game ? <SecondaryButton type="button" onClick={() => onCorrectGame(game.id)} className="mt-4 inline-flex items-center gap-2"><Pencil size={15} /> Correct game</SecondaryButton> : null}
            </details>
          </Card>
        );
      })}
    </div>
  );
}
