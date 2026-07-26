"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Circle, Save } from "lucide-react";
import { FaFutbol } from "react-icons/fa6";
import { GiGoalKeeper, GiSoccerKick } from "react-icons/gi";
import { MdOutlineReplay } from "react-icons/md";
import { supabase } from "@/lib/supabase";
import { Game, GameLineup, LeagueData, TeamCode } from "@/lib/types";
import { isGuestPlayer } from "@/lib/playerEligibility";
import { cn, playerName } from "@/lib/utils";
import { PrimaryButton } from "./ui";

type StatKey = "goals" | "assists" | "saves" | "own_goals";
type StatValues = Record<StatKey, number>;
type StatsDraft = Record<string, StatValues>;

const statColumns: { key: StatKey; label: string; title: string; icon: typeof FaFutbol }[] = [
  { key: "goals", label: "G", title: "Goals", icon: FaFutbol },
  { key: "assists", label: "A", title: "Assists", icon: GiSoccerKick },
  { key: "saves", label: "S", title: "Saves", icon: GiGoalKeeper },
  { key: "own_goals", label: "OG", title: "Own goals", icon: MdOutlineReplay }
];

function totalsForPlayer(data: LeagueData, gameId: string, playerId: string): StatValues {
  const events = data.events.filter(event => event.game_id === gameId);
  const saved = data.playerStats.find(stat => stat.game_id === gameId && stat.player_id === playerId);
  return {
    goals: events.filter(event => event.event_type === "goal" && event.player_id === playerId).length + (saved?.goals || 0),
    assists: events.filter(event => event.event_type === "goal" && event.assist_player_id === playerId).length + (saved?.assists || 0),
    saves: saved?.saves || 0,
    own_goals: events.filter(event => event.event_type === "own_goal" && event.player_id === playerId).length + (saved?.own_goals || 0)
  };
}

export function AdminMatchStatsGrid({
  game,
  data,
  lineups,
  disabled,
  onSaved,
  onDirtyChange,
  notify
}: {
  game: Game;
  data: LeagueData;
  lineups: GameLineup[];
  disabled: boolean;
  onSaved: () => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  notify: (message: string) => void;
}) {
  const initialDraft = useMemo(() => Object.fromEntries(
    lineups.map(lineup => [lineup.player_id, totalsForPlayer(data, game.id, lineup.player_id)])
  ), [data, game.id, lineups]);
  const [draft, setDraft] = useState<StatsDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const warnings = (["A", "B"] as TeamCode[]).flatMap(team => {
    const teamLineups = lineups.filter(lineup => lineup.team === team);
    const goals = teamLineups.reduce((total, lineup) => total + (draft[lineup.player_id]?.goals || 0), 0);
    const assists = teamLineups.reduce((total, lineup) => total + (draft[lineup.player_id]?.assists || 0), 0);
    return assists > goals ? [`Team ${team} has ${assists} assists but only ${goals} normal goal${goals === 1 ? "" : "s"}.`] : [];
  });

  useEffect(() => {
    setDraft(initialDraft);
    setDirty(false);
    onDirtyChange?.(false);
  }, [initialDraft, onDirtyChange]);

  function change(playerId: string, key: StatKey, rawValue: string) {
    const parsed = rawValue === "" ? 0 : Number(rawValue);
    const value = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    setDraft(current => ({
      ...current,
      [playerId]: { ...(current[playerId] || { goals: 0, assists: 0, saves: 0, own_goals: 0 }), [key]: value }
    }));
    setDirty(true);
    onDirtyChange?.(true);
  }

  async function save() {
    if (disabled || lineups.length !== 10) return;
    setSaving(true);
    const submittedStats = lineups.map(lineup => ({
      player_id: lineup.player_id,
      team: lineup.team,
      role: lineup.role,
      goals: draft[lineup.player_id]?.goals || 0,
      assists: draft[lineup.player_id]?.assists || 0,
      saves: draft[lineup.player_id]?.saves || 0,
      own_goals: draft[lineup.player_id]?.own_goals || 0
    }));
    const { error } = await supabase.rpc("save_game_stat_grid", {
      target_game_id: game.id,
      submitted_stats: submittedStats
    });
    setSaving(false);
    if (error) return notify(error.message);
    setDirty(false);
    onDirtyChange?.(false);
    notify("Match statistics saved.");
    await onSaved();
  }

  return (
    <section className={cn("overflow-hidden rounded-[1.3rem] border border-league-gold/22 bg-ink-850", disabled && "opacity-65")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-league-gold/15 px-4 py-3.5 sm:px-5">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/65">Full-time entry</div>
          <h4 className="mt-0.5 font-display text-2xl uppercase sm:text-3xl">Match statistics</h4>
          <p className="mt-1 text-xs text-chalk/40">Enter the final totals once, then save the complete result together.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider", dirty ? "border-amber-300/25 bg-amber-300/[.07] text-amber-200" : "border-turf-400/20 bg-turf-400/[.055] text-turf-100/70")}>
            {dirty ? <Circle size={7} fill="currentColor" /> : null}{dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <PrimaryButton type="button" onClick={save} disabled={disabled || saving || !dirty || lineups.length !== 10} className="inline-flex items-center gap-2 rounded-xl">
            <Save size={15} /> {saving ? "Saving..." : "Save all stats"}
          </PrimaryButton>
        </div>
      </div>

      <div className="grid gap-px bg-league-gold/15 lg:grid-cols-2">
        <TeamStatTable team="A" data={data} lineups={lineups} draft={draft} disabled={disabled || saving} onChange={change} />
        <TeamStatTable team="B" data={data} lineups={lineups} draft={draft} disabled={disabled || saving} onChange={change} />
      </div>

      {warnings.length ? <div className="border-t border-amber-300/15 bg-amber-300/[.045] px-4 py-3 text-xs text-amber-100/80"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={15} /><div><div className="font-bold text-amber-200">Check the assist totals</div>{warnings.map(warning => <div key={warning} className="mt-0.5">{warning}</div>)}</div></div></div> : null}
      {lineups.length !== 10 ? <p className="border-t border-league-gold/15 px-4 py-3 text-center text-xs text-league-gold">Save both five-player lineups before entering match statistics.</p> : null}
    </section>
  );
}

function TeamStatTable({
  team,
  data,
  lineups,
  draft,
  disabled,
  onChange
}: {
  team: TeamCode;
  data: LeagueData;
  lineups: GameLineup[];
  draft: StatsDraft;
  disabled: boolean;
  onChange: (playerId: string, key: StatKey, value: string) => void;
}) {
  const rows = lineups
    .filter(lineup => lineup.team === team)
    .sort((first, second) => (first.slot_index ?? 99) - (second.slot_index ?? 99));
  const totals = Object.fromEntries(statColumns.map(column => [
    column.key,
    rows.reduce((total, lineup) => total + (draft[lineup.player_id]?.[column.key] || 0), 0)
  ])) as StatValues;

  function navigate(event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) {
    const keyMoves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [event.shiftKey ? -1 : 1, 0]
    };
    const move = keyMoves[event.key];
    if (!move) return;
    const nextRow = rowIndex + move[0];
    const nextColumn = columnIndex + move[1];
    if (nextRow < 0 || nextRow >= rows.length || nextColumn < 0 || nextColumn >= statColumns.length) return;
    event.preventDefault();
    const target = event.currentTarget
      .closest("table")
      ?.querySelector<HTMLInputElement>(`[data-stat-cell="${nextRow}-${nextColumn}"]`);
    target?.focus();
    target?.select();
  }

  return (
    <div className="min-w-0 bg-ink-850 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h5 className="font-display text-2xl uppercase">Team {team}</h5>
        <span className="rounded-full border border-league-gold/15 bg-league-gold/[.055] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-league-gold">{rows.length}/5</span>
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-xl border border-league-gold/15">
        <table className="w-full min-w-[24rem] border-collapse">
          <thead className="sticky top-0 z-20 border-b border-league-gold/20 bg-ink-850">
            <tr>
              <th className="sticky left-0 z-30 border-r border-league-gold/15 bg-ink-850 px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-chalk/35">Player</th>
              {statColumns.map(column => {
                const Icon = column.icon;
                return <th key={column.key} className="w-14 px-1 py-2 text-center" title={column.title}><span className="inline-flex items-center gap-1 text-[9px] font-black text-league-gold/70"><Icon size={12} /> {column.label}</span></th>;
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-league-gold/12">
            {rows.map((lineup, rowIndex) => {
              const player = data.players.find(item => item.id === lineup.player_id);
              return (
                <tr key={lineup.player_id} className="transition focus-within:bg-league-gold/[.035] hover:bg-chalk/[.015]">
                  <th scope="row" className="sticky left-0 z-10 max-w-36 border-r border-league-gold/10 bg-ink-850 px-3 py-2 text-left">
                    <span className="block truncate text-xs font-semibold">{playerName(data.players, lineup.player_id)}</span>
                    <span className="mt-0.5 block text-[8px] font-black uppercase tracking-wider text-chalk/28">{lineup.role === "goalkeeper" ? "Fixed GK" : "OUT"}{isGuestPlayer(player) ? " / Guest" : ""}</span>
                  </th>
                  {statColumns.map((column, columnIndex) => (
                    <td key={column.key} className="px-1 py-1.5 text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        disabled={disabled}
                        value={draft[lineup.player_id]?.[column.key] ?? 0}
                        onChange={event => onChange(lineup.player_id, column.key, event.target.value)}
                        onKeyDown={event => navigate(event, rowIndex, columnIndex)}
                        onFocus={event => event.currentTarget.select()}
                        data-stat-cell={`${rowIndex}-${columnIndex}`}
                        aria-label={`${column.title} for ${playerName(data.players, lineup.player_id)}`}
                        className="h-9 w-11 rounded-lg border border-chalk/[.065] bg-black/25 px-1 text-center font-mono text-sm text-chalk outline-none transition focus:border-league-gold/60 focus:bg-league-gold/[.055] focus:ring-1 focus:ring-league-gold/30 disabled:opacity-50"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-chalk/35">No Team {team} lineup saved.</td></tr> : null}
          </tbody>
          {rows.length ? <tfoot className="sticky bottom-0 z-20 border-t border-league-gold/20 bg-ink-900"><tr><th scope="row" className="sticky left-0 z-30 border-r border-league-gold/15 bg-ink-900 px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-league-gold">Team total</th>{statColumns.map(column => <td key={column.key} className="px-1 py-2 text-center font-mono text-sm font-black text-league-gold">{totals[column.key]}</td>)}</tr></tfoot> : null}
        </table>
      </div>
    </div>
  );
}
