"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCw, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyActionError } from "@/lib/actionErrors";
import { Game, Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { Card, EmptyState, ErrorState, LoadingState, Pill, SecondaryButton, Select } from "./ui";
import { AdminNotificationComposer } from "./AdminNotificationComposer";

type DeliveryStatus = "pending" | "sent" | "failed" | "expired" | "skipped";

type DeliveryRow = {
  id: string;
  user_id: string;
  status: DeliveryStatus;
  attempt_count: number;
  error_message: string | null;
};

type DispatchRow = {
  id: string;
  notification_type: string;
  game_id: string | null;
  title: string;
  body: string;
  source: "admin" | "scheduled";
  created_by: string | null;
  created_at: string;
  notification_deliveries: DeliveryRow[];
};

const TYPE_LABELS: Record<string, string> = {
  announcement: "Announcement",
  new_game: "New game",
  lineups_ready: "Confirmed lineups",
  final_results: "Final result",
  fantasy_deadline: "Fantasy deadline"
};

export function AdminNotificationHistory({ profiles, games }: { profiles: Profile[]; games: Game[] }) {
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: requestError } = await supabase
      .from("notification_dispatches")
      .select("id, notification_type, game_id, title, body, source, created_by, created_at, notification_deliveries(id, user_id, status, attempt_count, error_message)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (requestError) {
      setError(friendlyActionError(requestError, "Notification history could not be loaded. Check the database setup and try again."));
      setRows([]);
    } else {
      setRows((data || []) as DispatchRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => type === "all" ? rows : rows.filter(row => row.notification_type === type), [rows, type]);

  async function retry(dispatchId: string) {
    setRetrying(dispatchId);
    setMessage(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Your login session could not be found.");
      setRetrying(null);
      return;
    }
    const response = await fetch("/api/push/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ dispatchId })
    });
    const body = await response.json().catch(() => null) as { error?: string; result?: { sent: number; failed: number; removed: number } } | null;
    setMessage(response.ok
      ? `Retry finished: ${body?.result?.sent || 0} sent, ${body?.result?.failed || 0} still failed, ${body?.result?.removed || 0} expired.`
      : body?.error || "Could not retry failed notifications.");
    setRetrying(null);
    await load();
  }

  if (loading && !rows.length) return <div className="space-y-4"><AdminNotificationComposer games={games} onSent={load} /><LoadingState label="Loading notification delivery history" cards={3} /></div>;
  if (error) return <div className="space-y-4"><AdminNotificationComposer games={games} onSent={load} /><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="space-y-4">
      <AdminNotificationComposer games={games} onSent={load} />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-3"><BellRing className="text-league-gold" /><h2 className="font-display text-3xl uppercase">Notification delivery</h2></div><p className="mt-1 text-sm text-chalk/55">The latest 100 sends, delivery totals, errors, and retryable failures.</p></div>
          <SecondaryButton type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</SecondaryButton>
        </div>
        <Select value={type} onChange={event => setType(event.target.value)} className="mt-4 md:max-w-xs" aria-label="Filter notification type">
          <option value="all">All notification types</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        {message ? <p className="mt-3 text-sm text-chalk/65" role="status">{message}</p> : null}
      </Card>

      {!filtered.length ? <EmptyState title="No notification history" text="Announcements, game updates, results, and reminders will appear here." /> : null}
      {filtered.map(row => {
        const counts = row.notification_deliveries.reduce<Record<DeliveryStatus, number>>((total, delivery) => {
          total[delivery.status] += 1;
          return total;
        }, { pending: 0, sent: 0, failed: 0, expired: 0, skipped: 0 });
        const game = games.find(item => item.id === row.game_id);
        const admin = profiles.find(profile => profile.id === row.created_by)?.username;
        const failures = row.notification_deliveries.filter(delivery => delivery.status === "failed");
        return (
          <Card key={row.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-2xl uppercase">{TYPE_LABELS[row.notification_type] || row.notification_type}</h3><Pill>{row.source === "scheduled" ? "Automatic" : "Admin"}</Pill>{game ? <Pill>{formatDateTime(game.game_date)}</Pill> : null}</div>
                <p className="mt-2 font-semibold text-chalk/80">{row.title}</p>
                <p className="mt-1 text-sm text-chalk/50">{row.body}</p>
                <p className="mt-2 text-xs text-chalk/35">{admin ? `Sent by ${admin} · ` : ""}{formatDateTime(row.created_at)}</p>
              </div>
              {counts.failed ? <SecondaryButton type="button" disabled={retrying === row.id} onClick={() => void retry(row.id)} className="inline-flex items-center gap-2"><RotateCcw size={16} />{retrying === row.id ? "Retrying..." : `Retry ${counts.failed}`}</SecondaryButton> : null}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
              <DeliveryCount label="Total" value={row.notification_deliveries.length} />
              <DeliveryCount label="Sent" value={counts.sent} tone="success" />
              <DeliveryCount label="Failed" value={counts.failed} tone={counts.failed ? "danger" : undefined} />
              <DeliveryCount label="Expired" value={counts.expired} />
              <DeliveryCount label="Pending" value={counts.pending} />
            </div>
            {failures.length ? <details className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-3"><summary className="cursor-pointer text-sm font-semibold text-red-100">View failed deliveries</summary><div className="mt-3 space-y-2">{failures.map(delivery => <div key={delivery.id} className="text-xs text-red-100/70"><strong>{profiles.find(profile => profile.id === delivery.user_id)?.username || "Unknown user"}</strong> · attempt {delivery.attempt_count}: {delivery.error_message || "Unknown provider error"}</div>)}</div></details> : null}
          </Card>
        );
      })}
    </div>
  );
}

function DeliveryCount({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-turf-400" : tone === "danger" ? "text-red-300" : "text-chalk";
  return <div className="rounded-xl border border-league-gold/15 bg-black/20 p-2 text-center"><div className={`font-mono text-xl ${color}`}>{value}</div><div className="text-[10px] uppercase tracking-wider text-chalk/40">{label}</div></div>;
}
