"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LeagueData, Season } from "@/lib/types";
import { currentSeason } from "@/lib/utils";
import { Card, EmptyState, Pill, PrimaryButton, SecondaryButton, TextInput } from "./ui";

export function AdminSeasonManager({ data, reload }: { data: LeagueData; reload: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = currentSeason(data);
  const unassignedGames = data.games.filter(game => !game.season_id).length;

  async function activateYearly() {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("set_season_mode", { new_mode: "yearly", target_season_id: null });
    setMessage(error ? error.message : "Yearly seasons are now active.");
    setBusy(false);
    if (!error) reload();
  }

  async function activateCustom(season: Season) {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("set_season_mode", { new_mode: "custom", target_season_id: season.id });
    setMessage(error ? error.message : `${season.name} is now the current season.`);
    setBusy(false);
    if (!error) reload();
  }

  async function createCustom(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !startDate || !endDate) return setMessage("Enter a name, start date, and end date.");
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("create_custom_season", {
      season_name: name.trim(), season_start: startDate, season_end: endDate, make_current: true
    });
    setMessage(error ? error.message : `${name.trim()} was created and selected.`);
    setBusy(false);
    if (!error) {
      setName("");
      setStartDate("");
      setEndDate("");
      reload();
    }
  }

  function beginEdit(season: Season) {
    setEditingId(season.id);
    setEditName(season.name);
    setEditStart(season.start_date);
    setEditEnd(season.end_date);
    setMessage(null);
  }

  async function saveEdit(season: Season) {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("update_custom_season", {
      target_season_id: season.id, season_name: editName.trim(), season_start: editStart, season_end: editEnd
    });
    setMessage(error ? error.message : `${editName.trim()} was updated.`);
    setBusy(false);
    if (!error) {
      setEditingId(null);
      reload();
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-3"><CalendarDays className="text-perimeter-400" /><h2 className="font-display text-3xl uppercase">Season format</h2></div><p className="mt-2 max-w-2xl text-sm text-chalk/55">Yearly mode automatically groups games into 2026, 2027, and later calendar years. Custom mode uses date ranges you create.</p></div>
          <Pill>{data.leagueSettings?.season_mode === "custom" ? "Custom" : "Yearly"}</Pill>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => void activateYearly()} disabled={busy} className={`rounded-2xl border p-4 text-left transition ${data.leagueSettings?.season_mode !== "custom" ? "border-perimeter-400/50 bg-perimeter-400/10" : "border-white/10 bg-white/[0.03] hover:border-perimeter-400/30"}`}>
            <div className="flex items-center justify-between gap-2"><strong>Calendar year</strong>{data.leagueSettings?.season_mode !== "custom" ? <CheckCircle2 size={18} className="text-perimeter-400" /> : null}</div><p className="mt-1 text-sm text-chalk/50">January 1 to December 31. New years are created automatically.</p>
          </button>
          <div className={`rounded-2xl border p-4 ${data.leagueSettings?.season_mode === "custom" ? "border-perimeter-400/50 bg-perimeter-400/10" : "border-white/10 bg-white/[0.03]"}`}><div className="flex items-center justify-between gap-2"><strong>Custom dates</strong>{data.leagueSettings?.season_mode === "custom" ? <CheckCircle2 size={18} className="text-perimeter-400" /> : null}</div><p className="mt-1 text-sm text-chalk/50">Use named periods such as 2026/27 or Summer League.</p></div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm"><span className="text-chalk/45">Current season:</span> <strong className="text-chalk">{current?.name || "Not selected"}</strong>{current ? <span className="ml-2 text-chalk/45">{formatSeasonRange(current)}</span> : null}</div>
        {data.leagueSettings?.season_mode === "custom" && unassignedGames ? <div className="mt-3 rounded-2xl border border-floodlight/30 bg-floodlight/10 p-3 text-sm text-floodlight">{unassignedGames} game{unassignedGames === 1 ? " is" : "s are"} outside every custom season. Adjust a custom date range so seasonal totals include them.</div> : null}
        {message ? <p className="mt-3 text-sm text-chalk/65" role="status">{message}</p> : null}
      </Card>

      <Card>
        <div className="flex items-center gap-3"><Plus className="text-floodlight" /><h2 className="font-display text-3xl uppercase">Create custom season</h2></div>
        <p className="mt-1 text-sm text-chalk/50">Creating one makes it current and switches the league to custom mode. Custom date ranges cannot overlap.</p>
        <form onSubmit={createCustom} className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
          <TextInput value={name} onChange={event => setName(event.target.value)} placeholder="Season name, e.g. 2026/27" maxLength={60} />
          <TextInput type="date" value={startDate} onChange={event => setStartDate(event.target.value)} aria-label="Season start date" />
          <TextInput type="date" value={endDate} onChange={event => setEndDate(event.target.value)} aria-label="Season end date" />
          <PrimaryButton disabled={busy}>Create</PrimaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="font-display text-3xl uppercase">Season history</h2>
        <div className="mt-4 space-y-2">
          {data.seasons.map(season => {
            const gameCount = data.games.filter(game => game.season_id === season.id).length;
            const selected = season.id === current?.id;
            const editing = editingId === season.id;
            return (
              <div key={season.id} className={`rounded-2xl border p-4 ${selected ? "border-perimeter-400/40 bg-perimeter-400/10" : "border-white/10 bg-white/[0.03]"}`}>
                {editing ? (
                  <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
                    <TextInput value={editName} onChange={event => setEditName(event.target.value)} maxLength={60} aria-label="Season name" />
                    <TextInput type="date" value={editStart} onChange={event => setEditStart(event.target.value)} aria-label="Season start date" />
                    <TextInput type="date" value={editEnd} onChange={event => setEditEnd(event.target.value)} aria-label="Season end date" />
                    <div className="flex gap-2"><PrimaryButton type="button" disabled={busy} onClick={() => void saveEdit(season)}>Save</PrimaryButton><SecondaryButton type="button" onClick={() => setEditingId(null)}>Cancel</SecondaryButton></div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><div className="flex items-center gap-2"><strong>{season.name}</strong><Pill>{season.format}</Pill>{selected ? <Pill className="text-perimeter-400">Current</Pill> : null}</div><p className="mt-1 text-sm text-chalk/45">{formatSeasonRange(season)} - {gameCount} game{gameCount === 1 ? "" : "s"}</p></div>
                    <div className="flex gap-2">{season.format === "custom" ? <SecondaryButton type="button" onClick={() => beginEdit(season)} className="inline-flex items-center gap-2"><Pencil size={15} /> Edit</SecondaryButton> : null}{season.format === "custom" && !selected ? <SecondaryButton type="button" disabled={busy} onClick={() => void activateCustom(season)}>Make current</SecondaryButton> : null}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!data.seasons.length ? <EmptyState title="No seasons" text="Run the seasons migration to create the current yearly season." /> : null}
      </Card>
    </div>
  );
}

function formatSeasonRange(season: Season) {
  const format = (value: string) => new Intl.DateTimeFormat("en-LB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
  return `${format(season.start_date)} - ${format(season.end_date)}`;
}
