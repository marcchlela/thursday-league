"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { allTimeLeaderboard, weeklyLeaderboard } from "@/lib/scoring";
import { formatDateTime, playerName } from "@/lib/utils";
import { FantasyPick, Game, LeagueData, WeeklyFantasyResult } from "@/lib/types";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { Card, EmptyState, Pill, PrimaryButton, Stat } from "./ui";
import { PitchPicker } from "./PitchPicker";

export function FantasyTabs({ data, reload }: { data: LeagueData; reload: () => void }) {
  const [tab, setTab] = useState<"set" | "standings" | "history">("set");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-5xl uppercase">Fantasy</h1>
        <p className="mt-2 text-chalk/60">Pick five, captain one, and pray your mate doesn’t score an own goal.</p>
      </div>
      <div className="flex rounded-3xl border border-white/10 bg-white/[0.03] p-1">
        {[
          ["set", "Set Team"],
          ["standings", "Standings"],
          ["history", "History"]
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as any)} className={`flex-1 rounded-2xl px-4 py-3 font-bold transition ${tab === key ? "bg-perimeter-400/20 text-chalk ring-1 ring-perimeter-400/30" : "text-chalk/55 hover:text-chalk"}`}>{label}</button>
        ))}
      </div>
      {tab === "set" ? <SetTeam data={data} reload={reload} /> : null}
      {tab === "standings" ? <Standings data={data} /> : null}
      {tab === "history" ? <History data={data} /> : null}
    </div>
  );
}

function activeFantasyGame(data: LeagueData) {
  return [...data.games]
    .filter(g => g.status === "draft" || g.status === "live")
    .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())[0];
}

function SetTeam({ data, reload }: { data: LeagueData; reload: () => void }) {
  const { user } = useAuthProfile();
  const game = activeFantasyGame(data);
  const lineups = useMemo(() => game ? data.lineups.filter(l => l.game_id === game.id) : [], [data.lineups, game]);
  const squad = useMemo(() => game && user ? data.squads.find(s => s.game_id === game.id && s.user_id === user.id) : undefined, [data.squads, game, user]);
  const initialPicks = useMemo(() => squad ? data.picks.filter(p => p.squad_id === squad.id) : [], [data.picks, squad]);
  if (!game || !user) return <EmptyState title="No fantasy game open" text="Once the admin sets a lineup, your pitch picker appears here." />;

  const locked = game.status === "live" || game.status === "final";
  const lockState =
    game.status === "final"
      ? { label: "Final", text: "This game is final. Picks are locked." }
      : game.status === "live"
        ? { label: "Live - locked", text: "The game is live. Picks can no longer be changed." }
        : { label: "Lineup set - open", text: `Editable until kickoff: ${formatDateTime(game.game_date)}` };

  async function savePicks(draft: Omit<FantasyPick, "id" | "squad_id" | "created_at">[]) {
    if (!user) return;
    let squadId = squad?.id;
    if (!squadId) {
      const { data: newSquad, error } = await supabase
        .from("fantasy_squads")
        .insert({ user_id: user.id, game_id: game.id })
        .select("*")
        .single();
      if (error) throw error;
      squadId = newSquad.id;
    } else {
      await supabase.from("fantasy_picks").delete().eq("squad_id", squadId);
    }

    const rows = draft.map(p => ({ ...p, squad_id: squadId }));
    const { error } = await supabase.from("fantasy_picks").insert(rows);
    if (error) throw error;
    reload();
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Pill className={locked ? "border-floodlight/40 bg-floodlight/20 text-floodlight" : "border-perimeter-400/40 bg-perimeter-400/10 text-perimeter-400"}>{lockState.label}</Pill>
            <h2 className="mt-2 font-display text-3xl uppercase">Locks at kickoff</h2>
            <p className="text-chalk/60">{lockState.text}</p>
          </div>
          <div className="font-mono text-2xl text-chalk/70">{initialPicks.length ? "Your picks are in" : "No picks yet"}</div>
        </div>
      </Card>
      {lineups.length ? <PitchPicker players={data.players} lineups={lineups} initialPicks={initialPicks} locked={locked} onSave={savePicks} /> : <EmptyState title="Lineup pending" text="This game exists, but the admin has not picked who's playing yet." />}
    </div>
  );
}

function Standings({ data }: { data: LeagueData }) {
  const board = allTimeLeaderboard(data);
  const currentGame = activeFantasyGame(data);
  const pickedCount = currentGame ? data.squads.filter(s => s.game_id === currentGame.id).length : 0;
  const notPicked = currentGame ? Math.max(data.profiles.length - pickedCount, 0) : 0;

  const scorerRows = data.players
    .map(player => ({ player, goals: data.events.filter(e => e.event_type === "goal" && e.player_id === player.id).length }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 5);
  const assistRows = data.players
    .map(player => ({ player, assists: data.events.filter(e => e.event_type === "goal" && e.assist_player_id === player.id).length }))
    .sort((a, b) => b.assists - a.assists)
    .slice(0, 5);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl uppercase">All-time standings</h2>
            <p className="text-sm text-chalk/55">No season reset.</p>
          </div>
          {currentGame && currentGame.status === "draft" ? <Pill className="border-floodlight/40 bg-floodlight/10 text-floodlight">{notPicked} haven't picked yet</Pill> : null}
        </div>
        <div className="mt-5 space-y-2">
          {board.map(row => (
            <div key={row.userId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-perimeter-400/15 font-mono text-perimeter-400">#{row.rank}</span>
              <span className="font-semibold">{row.username}</span>
              <span className="font-mono text-xl">{row.points}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        <MiniBoard title="Top scorers" rows={scorerRows.map(r => [r.player.name, r.goals])} suffix="G" />
        <MiniBoard title="Top assists" rows={assistRows.map(r => [r.player.name, r.assists])} suffix="A" />
      </div>
    </div>
  );
}

function MiniBoard({ title, rows, suffix }: { title: string; rows: [string, number][]; suffix: string }) {
  return (
    <Card>
      <h3 className="font-display text-3xl uppercase">{title}</h3>
      <div className="mt-4 space-y-2">
        {rows.map(([name, value], index) => (
          <div key={name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-chalk/75">{index + 1}. {name}</span>
            <span className="font-mono text-perimeter-400">{value}{suffix}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function History({ data }: { data: LeagueData }) {
  const { user } = useAuthProfile();
  const finals = data.games.filter(g => g.status === "final").sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());
  const [selectedGameId, setSelectedGameId] = useState(finals[0]?.id || "");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const game = finals.find(g => g.id === selectedGameId) || finals[0];
  const board = game ? weeklyLeaderboard({ ...data, game }) : [];
  const myRow = user ? board.find(r => r.userId === user.id) : null;
  const ordered = myRow ? [myRow, ...board.filter(r => r.userId !== user?.id)] : board;
  const selectedRow = board.find(r => r.userId === selectedUserId) || myRow || board[0];

  if (!finals.length) return <EmptyState title="No history yet" text="Final games will appear here with that week's fantasy leaderboard." />;

  return (
    <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
      <Card>
        <h2 className="font-display text-3xl uppercase">Past games</h2>
        <div className="mt-4 space-y-2">
          {finals.map(g => (
            <button key={g.id} onClick={() => { setSelectedGameId(g.id); setSelectedUserId(null); }} className={`w-full rounded-2xl border p-3 text-left transition ${game?.id === g.id ? "border-perimeter-400/60 bg-perimeter-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
              <div className="font-semibold">{formatDateTime(g.game_date)}</div>
              <div className="text-sm text-chalk/50">POTM: {playerName(data.players, g.potm_player_id)}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-3xl uppercase">Weekly leaderboard</h2>
        <div className="mt-4 space-y-2">
          {ordered.map(row => (
            <button key={row.userId} onClick={() => setSelectedUserId(row.userId)} className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3 text-left ${row.userId === user?.id ? "border-floodlight/50 bg-floodlight/10" : "border-white/10 bg-white/[0.03]"}`}>
              <span className="font-mono text-perimeter-400">#{row.rank}</span>
              <span>{row.username}{row.userId === user?.id ? " · you" : ""}</span>
              <span className="font-mono text-xl">{row.points}</span>
            </button>
          ))}
        </div>

        {selectedRow ? <SquadBreakdown row={selectedRow} /> : null}
      </Card>
    </div>
  );
}

export function SquadBreakdown({ row }: { row: WeeklyFantasyResult }) {
  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-2xl uppercase">{row.username}'s squad</h3>
        <Stat label="points" value={row.points} />
      </div>
      <div className="mt-4 space-y-3">
        {row.breakdown.map(item => (
          <div key={item.playerId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">{item.playerName} {item.isCaptain ? <span className="ml-2 rounded-full bg-floodlight px-2 py-0.5 text-xs text-ink-900">C</span> : null}</div>
              <div className="font-mono text-xl text-perimeter-400">{item.points}</div>
            </div>
            <div className="mt-2 text-xs text-chalk/55">{item.lines.join(" · ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
