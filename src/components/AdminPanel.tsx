"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calculateScore } from "@/lib/scoring";
import { cn, formatDateTime, playerName, sortLineupsByRole, statusLabel } from "@/lib/utils";
import { Game, LeagueData, Player, PlayerPosition, TeamCode } from "@/lib/types";
import { AdminAuditHistory } from "./AdminAuditHistory";
import { Card, ConfirmDialog, EmptyState, Pill, PrimaryButton, PromptDialog, SecondaryButton, Select, TabList, TextInput, Toast } from "./ui";

type AdminTab = "games" | "roster" | "audit";
type AdminPushEvent = "game_scheduled" | "lineups_ready" | "result_finalized";
type PushSendResult = { total: number; sent: number; failed: number; removed: number };
type LineupDraft = Record<string, { team: TeamCode | null; role: PlayerPosition }>;
type ManualStatType = "goals" | "assists" | "saves";
type ConfirmState = {
  title: string;
  text?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
} | null;

async function sendAdminGameNotification(gameId: string, event: AdminPushEvent) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your login session could not be found.");

  const response = await fetch("/api/push/admin-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ gameId, event })
  });
  const body = await response.json().catch(() => null) as { error?: string; result?: PushSendResult } | null;
  if (!response.ok) throw new Error(body?.error || "The notification could not be sent.");
  return body?.result;
}

function deliveryMessage(action: string, result?: PushSendResult) {
  const delivered = result?.sent || 0;
  return `${action} Notification sent to ${delivered} device${delivered === 1 ? "" : "s"}.`;
}

export function AdminPanel({ data, reload }: { data: LeagueData; reload: () => void }) {
  const [activeTab, setActiveTab] = useState<AdminTab>("games");
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>("outfield");
  const [gameDate, setGameDate] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const games = useMemo(
    () => [...data.games].sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()),
    [data.games]
  );

  function notify(message: string) {
    setToast(message);
  }

  function requestConfirm(state: NonNullable<ConfirmState>) {
    setConfirmState(state);
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!playerNameInput.trim()) return;
    const { error } = await supabase.from("players").insert({ name: playerNameInput.trim(), default_position: playerPosition });
    if (error) return notify(error.message);
    setPlayerNameInput("");
    notify("Player added.");
    reload();
  }

  async function archivePlayer(id: string) {
    requestConfirm({
      title: "Archive player?",
      text: "The player will leave the active roster, but every old lineup, stat, event, and fantasy pick will remain intact.",
      confirmLabel: "Archive player",
      onConfirm: async () => {
        const { error } = await supabase.rpc("archive_player", { target_player_id: id });
        if (error) return notify(error.message);
        notify("Player archived.");
        reload();
      }
    });
  }

  async function createGame(e: React.FormEvent) {
    e.preventDefault();
    if (!gameDate) return;
    const { data: createdGame, error } = await supabase
      .from("games")
      .insert({ game_date: new Date(gameDate).toISOString(), status: "upcoming" })
      .select("id")
      .single();
    if (error) return notify(error.message);
    setGameDate("");
    try {
      const result = await sendAdminGameNotification(createdGame.id, "game_scheduled");
      notify(deliveryMessage("Game created.", result));
    } catch (notificationError) {
      notify(`Game created, but its notification failed: ${notificationError instanceof Error ? notificationError.message : "Unknown error."}`);
    }
    reload();
  }

  return (
    <div className="space-y-6">
      <Toast message={toast} onDone={() => setToast(null)} />
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || ""}
        text={confirmState?.text}
        confirmLabel={confirmState?.confirmLabel}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          const action = confirmState?.onConfirm;
          setConfirmState(null);
          await action?.();
        }}
      />
      <div>
        <h1 className="font-display text-5xl uppercase">Admin Control Room</h1>
        <p className="mt-2 text-chalk/60">Manage roster, games, lineups, live events, final results, and Player of the Match.</p>
      </div>

      <TabList
        idPrefix="admin"
        label="Admin sections"
        tabs={[{ id: "games", label: "Games" }, { id: "roster", label: "Roster" }, { id: "audit", label: "Audit history" }]}
        active={activeTab}
        onChange={id => setActiveTab(id as AdminTab)}
      />

      {activeTab === "games" ? (
        <div id="admin-games-panel" role="tabpanel" aria-labelledby="admin-games-tab" className="space-y-6">
          <QuickStartChecklist data={data} />
          <Card>
            <h2 className="font-display text-3xl uppercase">Create Game</h2>
            <form onSubmit={createGame} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <TextInput type="datetime-local" value={gameDate} onChange={e => setGameDate(e.target.value)} />
              <PrimaryButton>Create</PrimaryButton>
            </form>
          </Card>

          <div className="space-y-4">
            {games.map((game, index) => (
              <GameSection key={game.id} game={game} data={data} reload={reload} defaultOpen={index === 0} notify={notify} requestConfirm={requestConfirm} />
            ))}
          </div>
          {!games.length ? <EmptyState title="No games yet" text="Create the first Thursday game to start setting lineups." /> : null}
        </div>
      ) : activeTab === "roster" ? (
        <Card id="admin-roster-panel" role="tabpanel" aria-labelledby="admin-roster-tab">
          <h2 className="font-display text-3xl uppercase">Roster</h2>
          <form onSubmit={addPlayer} className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <TextInput value={playerNameInput} onChange={e => setPlayerNameInput(e.target.value)} placeholder="Player name" />
            <Select value={playerPosition} onChange={e => setPlayerPosition(e.target.value as PlayerPosition)}>
              <option value="outfield">Outfield</option>
              <option value="goalkeeper">Goalkeeper</option>
            </Select>
            <PrimaryButton>Add player</PrimaryButton>
          </form>

          <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.players.map(player => (
              <PlayerAdminRow key={player.id} player={player} onArchive={archivePlayer} reload={reload} notify={notify} />
            ))}
          </div>
        </Card>
      ) : (
        <div id="admin-audit-panel" role="tabpanel" aria-labelledby="admin-audit-tab">
          <AdminAuditHistory profiles={data.profiles} games={data.games} />
        </div>
      )}
    </div>
  );
}

function QuickStartChecklist({ data }: { data: LeagueData }) {
  const hasRoster = data.players.length >= 10;
  const hasGame = data.games.length > 0;
  const hasSavedLineup = data.games.some(game => {
    const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
    return lineups.filter(lineup => lineup.team === "A").length === 5 && lineups.filter(lineup => lineup.team === "B").length === 5;
  });
  const hasFantasyOpen = data.games.some(game => game.status === "draft" || game.status === "live" || game.status === "final");
  const hasGoneLive = data.games.some(game => game.status === "live" || game.status === "final");
  const steps = [
    { label: "Add roster", done: hasRoster, detail: `${data.players.length}/10 players` },
    { label: "Create game", done: hasGame },
    { label: "Set lineups", done: hasSavedLineup },
    { label: "Open fantasy", done: hasFantasyOpen },
    { label: "Mark live", done: hasGoneLive }
  ];

  if (steps.every(step => step.done)) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl uppercase">Quick Start</h2>
          <p className="text-sm text-chalk/55">A short checklist for getting the league moving.</p>
        </div>
        <Pill>{steps.filter(step => step.done).length}/{steps.length}</Pill>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {steps.map(step => (
          <div key={step.label} className={cn("rounded-2xl border p-3", step.done ? "border-perimeter-400/30 bg-perimeter-400/10" : "border-white/10 bg-white/[0.03]")}>
            <div className="text-sm font-bold">{step.done ? "Done" : "Next"}</div>
            <div className="mt-1 text-sm text-chalk/75">{step.label}</div>
            {step.detail ? <div className="mt-1 text-xs text-chalk/45">{step.detail}</div> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlayerAdminRow({ player, onArchive, reload, notify }: { player: Player; onArchive: (id: string) => void | Promise<void>; reload: () => void; notify: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [position, setPosition] = useState<PlayerPosition>(player.default_position);
  const [active, setActive] = useState(player.active);

  async function save() {
    const { error } = await supabase.from("players").update({ name: name.trim(), default_position: position, active }).eq("id", player.id);
    if (error) return notify(error.message);
    setEditing(false);
    notify("Player saved.");
    reload();
  }

  async function restore() {
    const { error } = await supabase.rpc("restore_player", { target_player_id: player.id });
    if (error) return notify(error.message);
    notify("Player restored to the active roster.");
    reload();
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-perimeter-400/30 bg-perimeter-400/10 p-3">
        <div className="grid gap-2">
          <TextInput value={name} onChange={e => setName(e.target.value)} />
          <Select value={position} onChange={e => setPosition(e.target.value as PlayerPosition)}>
            <option value="outfield">Outfield</option>
            <option value="goalkeeper">Goalkeeper</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-chalk/70"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-floodlight" /> Active</label>
          <div className="flex gap-2">
            <PrimaryButton type="button" onClick={save} className="flex-1">Save</PrimaryButton>
            <SecondaryButton type="button" onClick={() => setEditing(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <button type="button" onClick={() => setEditing(true)} className="min-w-0 text-left">
        <div className="truncate font-semibold">{player.name}</div>
        <div className="text-xs uppercase tracking-wider text-chalk/45">{player.default_position}{player.archived_at ? " - archived" : player.active ? "" : " - inactive"}</div>
      </button>
      {player.archived_at ? <button type="button" onClick={restore} className="rounded-xl border border-perimeter-400/30 px-3 py-1.5 text-xs font-bold text-perimeter-400">Restore</button> : <button type="button" onClick={() => onArchive(player.id)} className="rounded-xl p-2 text-chalk/45 hover:text-floodlight" aria-label={`Archive ${player.name}`}><Trash2 size={16} /></button>}
    </div>
  );
}

function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function GameSection({
  game,
  data,
  reload,
  defaultOpen,
  notify,
  requestConfirm
}: {
  game: Game;
  data: LeagueData;
  reload: () => void;
  defaultOpen: boolean;
  notify: (message: string) => void;
  requestConfirm: (state: NonNullable<ConfirmState>) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const events = data.events.filter(event => event.game_id === game.id);
  const playerStats = data.playerStats.filter(stat => stat.game_id === game.id);
  const score = calculateScore(events, lineups, playerStats);
  const savedTeamA = lineups.filter(lineup => lineup.team === "A");
  const savedTeamB = lineups.filter(lineup => lineup.team === "B");
  const lineupReady = savedTeamA.length === 5 && savedTeamB.length === 5 && savedTeamA.every(lineup => lineup.slot_index != null) && savedTeamB.every(lineup => lineup.slot_index != null) && savedTeamA.filter(lineup => lineup.role === "goalkeeper").length === 1 && savedTeamB.filter(lineup => lineup.role === "goalkeeper").length === 1;

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-3 bg-white/[0.03] px-5 py-4 text-left transition hover:bg-white/[0.06]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{statusLabel(game.status)}</Pill>
            <Pill className={lineupReady ? "border-perimeter-400/40 bg-perimeter-400/10 text-perimeter-400" : "border-floodlight/30 bg-floodlight/10 text-floodlight"}>
              {lineupReady ? "Lineup ready" : "Lineup pending"}
            </Pill>
          </div>
          <h2 className="mt-2 font-display text-3xl uppercase">{formatDateTime(game.game_date)}</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="font-mono text-3xl text-chalk">A {score.A} - {score.B} B</div>
          <ChevronDown className={cn("text-chalk/60 transition", open && "rotate-180")} size={22} />
        </div>
      </button>
      {open ? (
        <div className="space-y-6 p-4 md:p-5">
          <GameManager game={game} data={data} reload={reload} notify={notify} requestConfirm={requestConfirm} />
        </div>
      ) : null}
    </section>
  );
}

function GameManager({ game, data, reload, notify, requestConfirm }: { game: Game; data: LeagueData; reload: () => void; notify: (message: string) => void; requestConfirm: (state: NonNullable<ConfirmState>) => void }) {
  const currentLineup = useMemo(() => data.lineups.filter(l => l.game_id === game.id), [data.lineups, game.id]);
  const gameEvents = data.events.filter(e => e.game_id === game.id);
  const gamePlayerStats = data.playerStats.filter(stat => stat.game_id === game.id);
  const score = calculateScore(gameEvents, currentLineup, gamePlayerStats);
  const [lineupDraft, setLineupDraft] = useState<LineupDraft>({});
  const [lineupOpen, setLineupOpen] = useState(currentLineup.length === 0);
  const [dragPlayerId, setDragPlayerId] = useState<string | null>(null);
  const [eventType, setEventType] = useState<"goal" | "own_goal">("goal");
  const [eventPlayerId, setEventPlayerId] = useState(currentLineup[0]?.player_id || "");
  const [assistPlayerId, setAssistPlayerId] = useState("");
  const [minute, setMinute] = useState("");
  const [potm, setPotm] = useState(game.potm_player_id || "");
  const [dateEdit, setDateEdit] = useState(toLocalDatetimeInput(game.game_date));
  const [manualStatPlayerId, setManualStatPlayerId] = useState("");
  const [manualStatTeam, setManualStatTeam] = useState<TeamCode>("A");
  const [manualStatRole, setManualStatRole] = useState<PlayerPosition>("outfield");
  const [manualStatType, setManualStatType] = useState<ManualStatType>("goals");
  const [manualStatValue, setManualStatValue] = useState("0");
  const [correctionReason, setCorrectionReason] = useState("");
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  useEffect(() => {
    const draft: LineupDraft = {};
    for (const player of data.players) {
      const existing = currentLineup.find(l => l.player_id === player.id);
      draft[player.id] = {
        team: existing?.team || null,
        role: existing?.role || player.default_position
      };
    }
    setLineupDraft(draft);
    setEventPlayerId(currentLineup[0]?.player_id || "");
    setAssistPlayerId("");
    setPotm(game.potm_player_id || "");
    setDateEdit(toLocalDatetimeInput(game.game_date));
  }, [game.id, game.game_date, game.potm_player_id, data.players, currentLineup]);

  const rosterPlayers = useMemo(
    () => data.players.filter(player => (player.active && !player.archived_at) || lineupDraft[player.id]?.team),
    [data.players, lineupDraft]
  );
  const selectedPlayers = useMemo(() => rosterPlayers.filter(p => lineupDraft[p.id]?.team), [rosterPlayers, lineupDraft]);
  const availablePlayers = useMemo(() => rosterPlayers.filter(p => !lineupDraft[p.id]?.team), [rosterPlayers, lineupDraft]);
  const teamAPlayers = useMemo(() => selectedPlayers.filter(p => lineupDraft[p.id]?.team === "A"), [selectedPlayers, lineupDraft]);
  const teamBPlayers = useMemo(() => selectedPlayers.filter(p => lineupDraft[p.id]?.team === "B"), [selectedPlayers, lineupDraft]);
  const eventPlayers = useMemo(() => data.players.filter(player => currentLineup.some(lineup => lineup.player_id === player.id)), [data.players, currentLineup]);
  const selectedManualStatLineup = currentLineup.find(lineup => lineup.player_id === manualStatPlayerId);
  const statsPlayers = data.players;
  const teamAGoalkeepers = teamAPlayers.filter(player => draftValue(player).role === "goalkeeper").length;
  const teamBGoalkeepers = teamBPlayers.filter(player => draftValue(player).role === "goalkeeper").length;
  const lineupIssues = [
    teamAPlayers.length !== 5 ? `Team A needs exactly 5 players (${teamAPlayers.length}/5).` : null,
    teamBPlayers.length !== 5 ? `Team B needs exactly 5 players (${teamBPlayers.length}/5).` : null,
    teamAGoalkeepers !== 1 ? `Team A needs exactly one goalkeeper (${teamAGoalkeepers}/1).` : null,
    teamBGoalkeepers !== 1 ? `Team B needs exactly one goalkeeper (${teamBGoalkeepers}/1).` : null
  ].filter(Boolean) as string[];
  const lineupCanSave = lineupIssues.length === 0;
  const draftReady = lineupCanSave;
  const savedTeamA = currentLineup.filter(lineup => lineup.team === "A");
  const savedTeamB = currentLineup.filter(lineup => lineup.team === "B");
  const lineupReady = savedTeamA.length === 5 && savedTeamB.length === 5 && savedTeamA.every(lineup => lineup.slot_index != null) && savedTeamB.every(lineup => lineup.slot_index != null) && savedTeamA.filter(lineup => lineup.role === "goalkeeper").length === 1 && savedTeamB.filter(lineup => lineup.role === "goalkeeper").length === 1;
  const canFinalize = lineupReady;
  const matchControlText = lineupReady
    ? "Lineups are ready. You can start the game, log events, and set POTM."
    : draftReady
      ? "Save this lineup before starting the game or entering events."
      : "Save exactly 5 players on each team, including one goalkeeper, before starting the game or entering events.";

  function draftValue(player: Player) {
    return lineupDraft[player.id] || { team: null, role: player.default_position };
  }

  function movePlayer(playerId: string, team: TeamCode | null) {
    const player = data.players.find(p => p.id === playerId);
    if (!player) return;
    setLineupDraft(draft => ({
      ...draft,
      [playerId]: {
        team,
        role: draft[playerId]?.role || player.default_position
      }
    }));
  }

  function setRole(player: Player, role: PlayerPosition) {
    const value = draftValue(player);
    setLineupDraft(draft => ({ ...draft, [player.id]: { ...value, role } }));
  }

  function handleDrop(e: React.DragEvent, team: TeamCode | null) {
    e.preventDefault();
    const playerId = e.dataTransfer.getData("text/plain") || dragPlayerId;
    if (playerId) movePlayer(playerId, team);
    setDragPlayerId(null);
  }

  async function saveLineup() {
    if (!lineupCanSave) {
      notify("Fix lineup issues before saving.");
      return;
    }
    const rows = (["A", "B"] as TeamCode[]).flatMap(team => {
      const teamPlayers = (team === "A" ? teamAPlayers : teamBPlayers).slice().sort((a, b) => {
        const roleDifference = draftValue(a).role === draftValue(b).role ? 0 : draftValue(a).role === "goalkeeper" ? -1 : 1;
        return roleDifference || a.name.localeCompare(b.name);
      });
      return teamPlayers.map((player, slot_index) => ({ player_id: player.id, team, role: draftValue(player).role, slot_index }));
    });
    const firstPublication = !lineupReady;
    const { error } = await supabase.rpc("save_game_lineup", { target_game_id: game.id, submitted_lineup: rows });
    if (error) return notify(error.message);
    setLineupOpen(false);
    if (firstPublication) {
      try {
        const result = await sendAdminGameNotification(game.id, "lineups_ready");
        notify(deliveryMessage("Lineup saved.", result));
      } catch (notificationError) {
        notify(`Lineup saved, but its notification failed: ${notificationError instanceof Error ? notificationError.message : "Unknown error."}`);
      }
    } else {
      notify("Lineup saved. No new notification was sent for this edit.");
    }
    reload();
  }

  async function updateStatus(status: Game["status"]) {
    if ((status === "live" || status === "final") && !lineupReady) {
      notify("Set and save exactly 5 players per team, including one goalkeeper, before changing the game status.");
      return;
    }
    if (status === "final" && !canFinalize) {
      notify("Cannot mark final before lineups are saved.");
      return;
    }
    const { error } = await supabase.rpc("set_game_status", { target_game_id: game.id, new_status: status });
    if (error) return notify(error.message);
    if (status === "final") {
      try {
        const result = await sendAdminGameNotification(game.id, "result_finalized");
        notify(deliveryMessage("Game marked final.", result));
      } catch (notificationError) {
        notify(`Game marked final, but its notification failed: ${notificationError instanceof Error ? notificationError.message : "Unknown error."}`);
      }
    } else {
      notify(`Game marked ${statusLabel(status).toLowerCase()}.`);
    }
    reload();
  }

  function requestFinalization() {
    const warnings = [
      !game.potm_player_id ? "POTM is not set." : null,
      gameEvents.length === 0 && gamePlayerStats.every(stat => stat.goals === 0) ? "No goals or own goals are recorded." : null,
      potm !== (game.potm_player_id || "") ? "The current POTM selection has not been saved." : null
    ].filter(Boolean);
    requestConfirm({
      title: "Finalize this game?",
      text: `Final score: Team A ${score.A} - ${score.B} Team B. POTM: ${playerName(data.players, game.potm_player_id)}.${warnings.length ? ` Check before finalizing: ${warnings.join(" ")}` : " All key result data is present."} Final games are locked until reopened with a correction reason.`,
      confirmLabel: "Finalize game",
      onConfirm: () => updateStatus("final")
    });
  }

  async function reopenForCorrection() {
    const { error } = await supabase.rpc("reopen_final_game", { target_game_id: game.id, correction_reason: correctionReason.trim() });
    if (error) return notify(error.message);
    setReopenDialogOpen(false);
    setCorrectionReason("");
    notify("Game reopened for a controlled correction.");
    reload();
  }

  async function saveGameDetails() {
    if (!dateEdit) return;
    const { error } = await supabase.from("games").update({ game_date: new Date(dateEdit).toISOString() }).eq("id", game.id);
    if (error) return notify(error.message);
    notify("Game date saved.");
    reload();
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!lineupReady || !eventPlayerId) return;
    const { error } = await supabase.from("events").insert({
      game_id: game.id,
      event_type: eventType,
      player_id: eventPlayerId,
      assist_player_id: eventType === "goal" && assistPlayerId ? assistPlayerId : null,
      minute: minute ? Number(minute) : null
    });
    if (error) return notify(error.message);
    setMinute("");
    setAssistPlayerId("");
    notify("Event added.");
    reload();
  }

  async function deleteEvent(id: string) {
    requestConfirm({
      title: "Delete event?",
      text: "This removes the goal or own goal from this game.",
      confirmLabel: "Delete event",
      onConfirm: async () => {
        const { error } = await supabase.from("events").delete().eq("id", id);
        if (error) return notify(error.message);
        notify("Event deleted.");
        reload();
      }
    });
  }

  async function savePotm() {
    if (!lineupReady) return;
    const { error } = await supabase.from("games").update({ potm_player_id: potm || null }).eq("id", game.id);
    if (error) return notify(error.message);
    notify("POTM saved.");
    reload();
  }

  function selectStatsPlayer(playerId: string) {
    const player = data.players.find(item => item.id === playerId);
    const existing = gamePlayerStats.find(stat => stat.player_id === playerId);
    const lineup = currentLineup.find(item => item.player_id === playerId);
    setManualStatPlayerId(playerId);
    setManualStatTeam(lineup?.team || existing?.team || "A");
    setManualStatRole(existing?.role || player?.default_position || "outfield");
    setManualStatValue(String(existing?.[manualStatType] || 0));
  }

  function selectStatType(statType: ManualStatType) {
    setManualStatType(statType);
    const existing = gamePlayerStats.find(stat => stat.player_id === manualStatPlayerId);
    setManualStatValue(String(existing?.[statType] || 0));
  }

  async function saveManualStats(e: React.FormEvent) {
    e.preventDefault();
    if (!manualStatPlayerId) return notify("Choose a player first.");
    const value = Number(manualStatValue);
    if (!Number.isInteger(value) || value < 0) return notify("Stat value must be a whole number of 0 or more.");
    const existing = gamePlayerStats.find(stat => stat.player_id === manualStatPlayerId);
    const team = selectedManualStatLineup?.team || manualStatTeam;

    const { error } = await supabase.from("game_player_stats").upsert({
      game_id: game.id,
      player_id: manualStatPlayerId,
      team,
      role: manualStatRole,
      goals: existing?.goals || 0,
      assists: existing?.assists || 0,
      saves: existing?.saves || 0,
      [manualStatType]: value
    }, { onConflict: "game_id,player_id" });
    if (error) return notify(error.message);
    notify("Player stats saved.");
    reload();
  }

  async function deleteGame() {
    requestConfirm({
      title: "Delete game?",
      text: "This deletes the game and its lineups, events, fantasy squads, and picks.",
      confirmLabel: "Delete game",
      onConfirm: async () => {
        const { error } = await supabase.from("games").delete().eq("id", game.id);
        if (error) return notify(error.message);
        notify("Game deleted.");
        reload();
      }
    });
  }

  return (
    <div className="space-y-6">
      <PromptDialog open={reopenDialogOpen} title="Reopen final game" text="Explain why this historical result needs a correction. The reason is stored in the admin audit log." value={correctionReason} placeholder="Correction reason" confirmLabel="Reopen game" onChange={setCorrectionReason} onCancel={() => { setReopenDialogOpen(false); setCorrectionReason(""); }} onConfirm={reopenForCorrection} />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Pill>{statusLabel(game.status)}</Pill>
            <h2 className="mt-2 font-display text-4xl uppercase">{formatDateTime(game.game_date)}</h2>
            <div className="mt-2 font-mono text-3xl">Team A {score.A} - {score.B} Team B</div>
            <div className="mt-4 flex max-w-md gap-2">
              <TextInput disabled={game.status === "final"} type="datetime-local" value={dateEdit} onChange={e => setDateEdit(e.target.value)} />
              <SecondaryButton disabled={game.status === "final"} type="button" onClick={saveGameDetails}>Save date</SecondaryButton>
            </div>
          </div>
          <button type="button" disabled={game.status === "final"} onClick={deleteGame} className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 font-semibold text-red-200 disabled:cursor-not-allowed disabled:opacity-40">Delete game</button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-3xl uppercase">Lineups</h3>
            <p className="text-sm text-chalk/55">{lineupOpen ? "Drag players into Team A or Team B. Drag them back to Available to remove them." : "Saved lineup is collapsed. Reopen it to make changes."}</p>
          </div>
          {lineupOpen ? (
            <PrimaryButton type="button" onClick={saveLineup} disabled={!lineupCanSave}>Save lineup</PrimaryButton>
          ) : (
            <PrimaryButton disabled={game.status === "final"} type="button" onClick={() => setLineupOpen(true)}>Edit lineup</PrimaryButton>
          )}
        </div>

        {lineupOpen ? (
          <>
            <LineupValidation issues={lineupIssues} />
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_.9fr_1fr]">
              <TeamDropZone title="Team A" team="A" players={teamAPlayers} lineupDraft={lineupDraft} onDrop={handleDrop}>
                {teamAPlayers.map(player => <LineupPlayerCard key={player.id} player={player} value={draftValue(player)} onDragStart={setDragPlayerId} onMove={movePlayer} onRole={setRole} />)}
              </TeamDropZone>

              <TeamDropZone title="Available" team={null} players={availablePlayers} lineupDraft={lineupDraft} onDrop={handleDrop} compact>
                {availablePlayers.map(player => <LineupPlayerCard key={player.id} player={player} value={draftValue(player)} onDragStart={setDragPlayerId} onMove={movePlayer} onRole={setRole} compact />)}
              </TeamDropZone>

              <TeamDropZone title="Team B" team="B" players={teamBPlayers} lineupDraft={lineupDraft} onDrop={handleDrop}>
                {teamBPlayers.map(player => <LineupPlayerCard key={player.id} player={player} value={draftValue(player)} onDragStart={setDragPlayerId} onMove={movePlayer} onRole={setRole} />)}
              </TeamDropZone>
            </div>
          </>
        ) : (
          <SavedLineupSummary players={data.players} lineups={currentLineup} />
        )}
      </Card>

      <Card className={!lineupReady ? "border-floodlight/30" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-3xl uppercase">Match Control</h3>
            <p className="text-sm text-chalk/55">{matchControlText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {game.status === "final" ? <SecondaryButton type="button" onClick={() => setReopenDialogOpen(true)}>Reopen for correction</SecondaryButton> : <><SecondaryButton type="button" onClick={() => updateStatus("upcoming")}>Upcoming</SecondaryButton><SecondaryButton type="button" onClick={() => updateStatus("draft")}>Draft</SecondaryButton><PrimaryButton type="button" disabled={!lineupReady} onClick={() => updateStatus("live")}>Mark live</PrimaryButton><SecondaryButton type="button" disabled={!canFinalize} onClick={requestFinalization}>Final</SecondaryButton></>}
          </div>
        </div>

        {game.correction_open ? <div className="mt-4 rounded-2xl border border-floodlight/40 bg-floodlight/10 p-3 text-sm font-semibold text-floodlight">Correction mode is open. Review the result and finalize the game again when the corrections are complete.</div> : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className={cn("rounded-3xl border border-white/10 bg-white/[0.03] p-4", !lineupReady && "opacity-60")}>
            <h4 className="font-display text-2xl uppercase">Events</h4>
            <form onSubmit={addEvent} className="mt-4 grid gap-3">
              <Select disabled={!lineupReady || game.status === "final"} value={eventType} onChange={e => setEventType(e.target.value as "goal" | "own_goal")}>
                <option value="goal">Goal</option>
                <option value="own_goal">Own goal</option>
              </Select>
              <Select disabled={!lineupReady || game.status === "final"} value={eventPlayerId} onChange={e => setEventPlayerId(e.target.value)}>
                <option value="">Select player</option>
                {eventPlayers.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
              </Select>
              {eventType === "goal" ? (
                <Select disabled={!lineupReady || game.status === "final"} value={assistPlayerId} onChange={e => setAssistPlayerId(e.target.value)}>
                  <option value="">No assist</option>
                  {eventPlayers.filter(player => player.id !== eventPlayerId && currentLineup.find(lineup => lineup.player_id === player.id)?.team === currentLineup.find(lineup => lineup.player_id === eventPlayerId)?.team).map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
                </Select>
              ) : null}
              <TextInput disabled={!lineupReady || game.status === "final"} type="number" min="0" max="200" value={minute} onChange={e => setMinute(e.target.value)} placeholder="Minute optional" />
              <PrimaryButton disabled={!lineupReady || game.status === "final"}>Add event</PrimaryButton>
            </form>

            <div className="mt-4 space-y-2">
              {gameEvents.map(event => (
                <div key={event.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <span>{event.minute != null ? `${event.minute}' - ` : ""}{event.event_type === "own_goal" ? "Own goal" : "Goal"}: {playerName(data.players, event.player_id)} {event.assist_player_id ? `- assist ${playerName(data.players, event.assist_player_id)}` : ""}</span>
                  {game.status !== "final" ? <button type="button" onClick={() => deleteEvent(event.id)} className="text-chalk/45 hover:text-red-300" aria-label="Delete event"><Trash2 size={16} /></button> : null}
                </div>
              ))}
            </div>
          </section>

          <section className={cn("rounded-3xl border border-white/10 bg-white/[0.03] p-4", !lineupReady && "opacity-60")}>
            <h4 className="font-display text-2xl uppercase">Player of the Match</h4>
            <div className="mt-4 flex gap-3">
              <Select disabled={!lineupReady || game.status === "final"} value={potm} onChange={e => setPotm(e.target.value)}>
                <option value="">No POTM</option>
                {eventPlayers.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
              </Select>
              <SecondaryButton type="button" disabled={!lineupReady || game.status === "final"} onClick={savePotm}>Save</SecondaryButton>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <h4 className="font-display text-2xl uppercase">Manual Player Stats</h4>
            <form onSubmit={saveManualStats} className="mt-4 grid gap-3">
              <Select value={manualStatPlayerId} onChange={e => selectStatsPlayer(e.target.value)}>
                <option value="">Select player</option>
                {statsPlayers.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
              </Select>
              {manualStatPlayerId ? selectedManualStatLineup ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-chalk/70">Team {selectedManualStatLineup.team}</div>
              ) : (
                <Select value={manualStatTeam} onChange={e => setManualStatTeam(e.target.value as TeamCode)}>
                  <option value="A">Team A</option>
                  <option value="B">Team B</option>
                </Select>
              ) : null}
              <Select value={manualStatType} onChange={e => selectStatType(e.target.value as ManualStatType)}>
                <option value="goals">Goals</option>
                <option value="assists">Assists</option>
                <option value="saves">Saves</option>
              </Select>
              <Select value={manualStatRole} onChange={e => setManualStatRole(e.target.value as PlayerPosition)}>
                <option value="outfield">Outfield</option>
                <option value="goalkeeper">Goalkeeper</option>
              </Select>
              <TextInput type="number" min="0" step="1" value={manualStatValue} onChange={e => setManualStatValue(e.target.value)} placeholder="Stat value" />
              <PrimaryButton disabled={game.status === "final"}>Save stats</PrimaryButton>
            </form>

            <div className="mt-4 space-y-2">
              {gamePlayerStats.map(stat => (
                <div key={stat.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                  <span><span className="font-semibold">{playerName(data.players, stat.player_id)}</span> - Team {stat.team}, {stat.role === "goalkeeper" ? "GK" : "O"}, {stat.goals} G, {stat.assists} A, {stat.saves} S</span>
                  <button type="button" onClick={() => selectStatsPlayer(stat.player_id)} className="rounded-lg p-1.5 text-chalk/50 hover:text-perimeter-400" aria-label={`Edit stats for ${playerName(data.players, stat.player_id)}`}>
                    <Pencil size={15} />
                  </button>
                </div>
              ))}
              {!gamePlayerStats.length ? <p className="text-sm text-chalk/55">No manual stats recorded.</p> : null}
            </div>
          </section>
        </div>
      </Card>
    </div>
  );
}

function TeamDropZone({
  title,
  team,
  players,
  onDrop,
  children,
  compact
}: {
  title: string;
  team: TeamCode | null;
  players: Player[];
  lineupDraft: LineupDraft;
  onDrop: (e: React.DragEvent, team: TeamCode | null) => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => onDrop(e, team)}
      className={cn("min-h-80 rounded-3xl border border-dashed border-white/15 bg-black/20 p-3", compact && "xl:order-none")}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-2xl uppercase">{title}</h4>
        <Pill>{players.length}</Pill>
      </div>
      <div className="space-y-2">
        {players.length ? children : <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm text-chalk/45">Drop players here</div>}
      </div>
    </div>
  );
}

function LineupValidation({ issues }: { issues: string[] }) {
  if (!issues.length) {
    return (
      <div className="mt-4 rounded-2xl border border-perimeter-400/30 bg-perimeter-400/10 p-3 text-sm font-semibold text-perimeter-400">
        Lineup is valid: exactly 5 players per team, with 1 goalkeeper and 4 outfield players.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-floodlight/30 bg-floodlight/10 p-3 text-sm text-floodlight">
      <div className="font-bold">Fix before saving:</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {issues.map(issue => <li key={issue}>{issue}</li>)}
      </ul>
    </div>
  );
}

function SavedLineupSummary({ players, lineups }: { players: Player[]; lineups: { player_id: string; team: TeamCode; role: PlayerPosition }[] }) {
  const teamA = lineups.filter(lineup => lineup.team === "A");
  const teamB = lineups.filter(lineup => lineup.team === "B");

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <SavedTeam title="Team A" players={players} lineups={teamA} />
      <SavedTeam title="Team B" players={players} lineups={teamB} />
    </div>
  );
}

function SavedTeam({ title, players, lineups }: { title: string; players: Player[]; lineups: { player_id: string; role: PlayerPosition }[] }) {
  const sorted = sortLineupsByRole(players, lineups.map((lineup, index) => ({
    id: `${lineup.player_id}-${index}`,
    game_id: "",
    team: "A",
    player_id: lineup.player_id,
    role: lineup.role
  })));

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-2xl uppercase">{title}</h4>
        <Pill>{lineups.length}</Pill>
      </div>
      <div className="space-y-2">
        {sorted.length ? sorted.map(lineup => (
          <div key={lineup.player_id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
            <span className="font-semibold">{playerName(players, lineup.player_id)}</span>
            <span className="rounded-xl bg-perimeter-400/15 px-2 py-1 text-xs font-black uppercase text-perimeter-400">{lineup.role === "goalkeeper" ? "GK" : "O"}</span>
          </div>
        )) : <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-chalk/45">No players saved.</div>}
      </div>
    </div>
  );
}

function LineupPlayerCard({
  player,
  value,
  onDragStart,
  onMove,
  onRole,
  compact
}: {
  player: Player;
  value: { team: TeamCode | null; role: PlayerPosition };
  onDragStart: (id: string) => void;
  onMove: (playerId: string, team: TeamCode | null) => void;
  onRole: (player: Player, role: PlayerPosition) => void;
  compact?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData("text/plain", player.id);
        onDragStart(player.id);
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
    >
      <div className="flex items-center gap-2">
        <GripVertical size={16} className="shrink-0 text-chalk/35" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{player.name}</div>
          <div className="text-xs uppercase tracking-wider text-chalk/40">Default {player.default_position}</div>
        </div>
        {value.team ? (
          <button type="button" onClick={() => onMove(player.id, null)} className="rounded-xl p-2 text-chalk/45 hover:text-red-300" aria-label={`Remove ${player.name} from lineup`}>
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-2" : "grid-cols-2")}>
        <RoleButton active={value.role === "outfield"} onClick={() => onRole(player, "outfield")}>O</RoleButton>
        <RoleButton active={value.role === "goalkeeper"} onClick={() => onRole(player, "goalkeeper")}>GK</RoleButton>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <MoveButton active={value.team === "A"} onClick={() => onMove(player.id, "A")}>Team A</MoveButton>
        <MoveButton active={value.team === "B"} onClick={() => onMove(player.id, "B")}>Team B</MoveButton>
        <MoveButton active={!value.team} onClick={() => onMove(player.id, null)}>Out</MoveButton>
      </div>
    </div>
  );
}

function MoveButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  const { active, className, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "rounded-xl border border-white/10 px-2 py-2 text-xs font-bold transition hover:border-floodlight/50",
        active ? "bg-floodlight text-ink-900" : "bg-black/20 text-chalk/60",
        className
      )}
    />
  );
}

function RoleButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  const { active, className, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "rounded-xl border border-white/10 px-3 py-2 text-sm font-black transition hover:border-perimeter-400/60",
        active ? "bg-perimeter-400 text-ink-900" : "bg-black/20 text-chalk/65",
        className
      )}
    />
  );
}
