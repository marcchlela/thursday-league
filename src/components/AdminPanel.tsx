"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CalendarPlus, CalendarRange, ChevronDown, Coins, Gamepad2, GripVertical, History, Trash2, UsersRound, X } from "lucide-react";
import { friendlyActionError } from "@/lib/actionErrors";
import { supabase } from "@/lib/supabase";
import { UNSAVED_CHANGES_MESSAGE, useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { calculateScore } from "@/lib/scoring";
import { isFantasyEligible, isGuestPlayer, isIndividualBettingEligible } from "@/lib/playerEligibility";
import { cn, formatDateTime, gameLineupIsReady, goalkeeperMode, playerName, sortLineupsByRole, statusLabel } from "@/lib/utils";
import { Game, GoalkeeperMode, LeagueData, Player, PlayerPosition, PlayerType, TeamCode } from "@/lib/types";
import { AdminMatchStatsGrid } from "./AdminMatchStatsGrid";
import { AdminAuditHistory } from "./AdminAuditHistory";
import { AdminBettingManager } from "./AdminBettingManager";
import { AdminNotificationHistory } from "./AdminNotificationHistory";
import { AdminSeasonManager } from "./AdminSeasonManager";
import { AdminStatsPanel } from "./AdminStatsPanel";
import { Card, ConfirmDialog, EmptyState, Pill, PrimaryButton, PromptDialog, SecondaryButton, Select, TextInput, Toast, ToastTone } from "./ui";

type AdminTab = "games" | "roster" | "betting" | "seasons" | "notifications" | "audit";
type AdminPushEvent = "game_scheduled" | "lineups_ready" | "result_finalized";
type PushSendResult = { total: number; sent: number; failed: number; removed: number; skipped?: boolean };
type LineupDraft = Record<string, { team: TeamCode | null; role: PlayerPosition }>;
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
  const failed = result?.failed || 0;
  if (result?.skipped) {
    return `${action} The notification was already recorded: ${delivered} sent${failed ? `, ${failed} failed` : ""}.`;
  }
  if (failed) {
    return `${action} Notification sent to ${delivered} device${delivered === 1 ? "" : "s"}; ${failed} failed. Retry failed deliveries in Notifications.`;
  }
  return `${action} Notification sent to ${delivered} device${delivered === 1 ? "" : "s"}.`;
}

export function AdminPanel({ data, reload }: { data: LeagueData; reload: () => void }) {
  const [activeTab, setActiveTab] = useState<AdminTab>("games");
  const [focusGameId, setFocusGameId] = useState<string | null>(null);
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>("outfield");
  const [newPlayerType, setNewPlayerType] = useState<PlayerType>("regular");
  const [newPlayerFantasyEligible, setNewPlayerFantasyEligible] = useState(true);
  const [newPlayerBettingEligible, setNewPlayerBettingEligible] = useState(true);
  const [gameDate, setGameDate] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [dirtyStatGameIds, setDirtyStatGameIds] = useState<Set<string>>(() => new Set());
  const games = useMemo(
    () => [...data.games].sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()),
    [data.games]
  );
  const hasUnsavedStats = dirtyStatGameIds.size > 0;

  useUnsavedChangesWarning(hasUnsavedStats);

  const setGameStatsDirty = useCallback((gameId: string, dirty: boolean) => {
    setDirtyStatGameIds(current => {
      const next = new Set(current);
      if (dirty) next.add(gameId);
      else next.delete(gameId);
      return next;
    });
  }, []);

  function changeAdminTab(nextTab: AdminTab) {
    if (nextTab === activeTab) return;
    if (hasUnsavedStats && !window.confirm(UNSAVED_CHANGES_MESSAGE)) return;
    setDirtyStatGameIds(new Set());
    setActiveTab(nextTab);
  }

  function notify(message: string, tone: ToastTone = "success") {
    setToast({ message, tone });
  }

  function requestConfirm(state: NonNullable<ConfirmState>) {
    setConfirmState(state);
  }

  function openGameControls(gameId: string) {
    setFocusGameId(gameId);
    setActiveTab("games");
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!playerNameInput.trim()) return;
    const { error } = await supabase.from("players").insert({
      name: playerNameInput.trim(),
      default_position: playerPosition,
      player_type: newPlayerType,
      fantasy_eligible: newPlayerFantasyEligible,
      individual_betting_eligible: newPlayerBettingEligible
    });
    if (error) return notify(friendlyActionError(error, "The player could not be added. Please try again."), "error");
    setPlayerNameInput("");
    setNewPlayerType("regular");
    setNewPlayerFantasyEligible(true);
    setNewPlayerBettingEligible(true);
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
        if (error) return notify(friendlyActionError(error, "The player could not be archived. Please try again."), "error");
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
    if (error) return notify(friendlyActionError(error, "The game could not be created. Please try again."), "error");
    setGameDate("");
    try {
      const result = await sendAdminGameNotification(createdGame.id, "game_scheduled");
      notify(deliveryMessage("Game created.", result));
    } catch (notificationError) {
      notify(`Game created, but its notification failed: ${friendlyActionError(notificationError, "Unknown notification error.")}`, "warning");
    }
    reload();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Toast message={toast?.message || null} tone={toast?.tone} onDone={() => setToast(null)} />
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
      <header>
        <div className="text-[10px] font-black uppercase tracking-[.2em] text-league-gold/65">League operations</div>
        <h1 className="mt-1 font-display text-4xl uppercase sm:text-5xl">Admin Control Room</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-chalk/40">Manage games, players, seasons, betting, notifications, and controlled corrections.</p>
      </header>

      <AdminStatsPanel data={data} />

      <AdminSectionTabs active={activeTab} onChange={changeAdminTab} />

      {activeTab === "games" ? (
        <div id="admin-games-panel" role="tabpanel" aria-labelledby="admin-games-tab" className="space-y-6">
          <QuickStartChecklist data={data} />
          <Card className="overflow-hidden p-0">
            <div className="grid md:grid-cols-[.72fr_1.28fr]">
              <div className="flex items-center gap-3 border-b border-league-gold/15 bg-league-gold/[.035] p-4 md:border-b-0 md:border-r sm:p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.07] text-league-gold"><CalendarPlus size={21} /></span>
                <div><div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/65">Schedule</div><h2 className="font-display text-3xl uppercase">Create Game</h2></div>
              </div>
              <form onSubmit={createGame} className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                <TextInput className="min-w-0 w-full" type="datetime-local" value={gameDate} onChange={e => setGameDate(e.target.value)} />
                <PrimaryButton className="w-full whitespace-nowrap sm:w-auto">Create game</PrimaryButton>
              </form>
            </div>
          </Card>

          <div className="space-y-4">
            {games.map((game, index) => (
              <GameSection key={game.id} game={game} data={data} reload={reload} defaultOpen={index === 0} forceOpen={focusGameId === game.id} statsDirty={dirtyStatGameIds.has(game.id)} onStatsDirtyChange={setGameStatsDirty} notify={notify} requestConfirm={requestConfirm} />
            ))}
          </div>
          {!games.length ? <EmptyState title="No games yet" text="Create the first Thursday game to start setting lineups." /> : null}
        </div>
      ) : activeTab === "roster" ? (
        <Card id="admin-roster-panel" role="tabpanel" aria-labelledby="admin-roster-tab">
          <h2 className="font-display text-3xl uppercase">Roster</h2>
          <form onSubmit={addPlayer} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_140px_auto] lg:items-center">
            <TextInput value={playerNameInput} onChange={e => setPlayerNameInput(e.target.value)} placeholder="Player name" />
            <Select value={playerPosition} onChange={e => setPlayerPosition(e.target.value as PlayerPosition)}>
              <option value="outfield">Outfield</option>
              <option value="goalkeeper">Goalkeeper</option>
            </Select>
            <Select value={newPlayerType} onChange={event => {
              const type = event.target.value as PlayerType;
              setNewPlayerType(type);
              setNewPlayerFantasyEligible(type === "regular");
              setNewPlayerBettingEligible(type === "regular");
            }}>
              <option value="regular">Regular player</option>
              <option value="guest">Guest player</option>
            </Select>
            <PrimaryButton>Add player</PrimaryButton>
            <div className="grid gap-2 sm:grid-cols-2 lg:col-span-4">
              <EligibilityToggle checked={newPlayerFantasyEligible} onChange={setNewPlayerFantasyEligible} title="Fantasy eligible" detail="Can be selected and earn Fantasy points." />
              <EligibilityToggle checked={newPlayerBettingEligible} onChange={setNewPlayerBettingEligible} title="Individual betting eligible" detail="Can receive personal goals, assists and saves markets." />
            </div>
          </form>

          <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.players.map(player => (
              <PlayerAdminRow key={player.id} player={player} onArchive={archivePlayer} reload={reload} notify={notify} />
            ))}
          </div>
        </Card>
      ) : activeTab === "betting" ? (
        <div id="admin-betting-panel" role="tabpanel" aria-labelledby="admin-betting-tab">
          <AdminBettingManager data={data} />
        </div>
      ) : activeTab === "seasons" ? (
        <div id="admin-seasons-panel" role="tabpanel" aria-labelledby="admin-seasons-tab">
          <AdminSeasonManager data={data} reload={reload} />
        </div>
      ) : activeTab === "notifications" ? (
        <div id="admin-notifications-panel" role="tabpanel" aria-labelledby="admin-notifications-tab">
          <AdminNotificationHistory profiles={data.profiles} games={data.games} />
        </div>
      ) : (
        <div id="admin-audit-panel" role="tabpanel" aria-labelledby="admin-audit-tab">
          <AdminAuditHistory profiles={data.profiles} games={data.games} onCorrectGame={openGameControls} />
        </div>
      )}
    </div>
  );
}

const adminTabs: { id: AdminTab; label: string; icon: typeof Gamepad2 }[] = [
  { id: "games", label: "Games", icon: Gamepad2 },
  { id: "roster", label: "Roster", icon: UsersRound },
  { id: "betting", label: "Betting", icon: Coins },
  { id: "seasons", label: "Seasons", icon: CalendarRange },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "audit", label: "Audit", icon: History }
];

function AdminSectionTabs({ active, onChange }: { active: AdminTab; onChange: (tab: AdminTab) => void }) {
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % adminTabs.length;
    else if (event.key === "ArrowLeft") target = (index - 1 + adminTabs.length) % adminTabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = adminTabs.length - 1;
    else return;
    event.preventDefault();
    const next = adminTabs[target];
    onChange(next.id);
    document.getElementById(`admin-${next.id}-tab`)?.focus();
  }

  return (
    <div className="grid grid-cols-3 gap-1 rounded-[1.2rem] border border-league-gold/25 bg-ink-850 p-1 shadow-[0_7px_20px_rgba(0,0,0,.13)] sm:grid-cols-6" role="tablist" aria-label="Admin sections">
      {adminTabs.map(tab => {
        const Icon = tab.icon;
        return (
          <button key={tab.id} id={`admin-${tab.id}-tab`} type="button" role="tab" aria-selected={active === tab.id} aria-controls={`admin-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} onKeyDown={event => onKeyDown(event, adminTabs.indexOf(tab))} className={cn("relative flex min-w-0 flex-col items-center gap-1 rounded-[.9rem] px-1 py-2.5 text-[10px] font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:text-xs", active === tab.id ? "bg-league-gold/[.1] text-league-gold" : "text-chalk/40 hover:bg-league-gold/[.04] hover:text-chalk")}>
            <Icon size={16} />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
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
          <div key={step.label} className={cn("rounded-2xl border p-3", step.done ? "border-turf-400/25 bg-turf-400/[.065]" : "border-league-gold/15 bg-black/15")}>
            <div className={cn("text-sm font-bold", step.done ? "text-turf-400" : "text-league-gold")}>{step.done ? "Done" : "Next"}</div>
            <div className="mt-1 text-sm text-chalk/75">{step.label}</div>
            {step.detail ? <div className="mt-1 text-xs text-chalk/45">{step.detail}</div> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlayerAdminRow({ player, onArchive, reload, notify }: { player: Player; onArchive: (id: string) => void | Promise<void>; reload: () => void; notify: (message: string, tone?: ToastTone) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [position, setPosition] = useState<PlayerPosition>(player.default_position);
  const [active, setActive] = useState(player.active);
  const [playerType, setPlayerType] = useState<PlayerType>(isGuestPlayer(player) ? "guest" : "regular");
  const [fantasyEligible, setFantasyEligible] = useState(isFantasyEligible(player));
  const [bettingEligible, setBettingEligible] = useState(isIndividualBettingEligible(player));

  async function save() {
    const { error } = await supabase.rpc("admin_update_player_settings", {
      target_player_id: player.id,
      new_name: name.trim(),
      new_position: position,
      new_active: active,
      new_player_type: playerType,
      new_fantasy_eligibility: fantasyEligible,
      new_betting_eligibility: bettingEligible
    });
    if (error) return notify(friendlyActionError(error, "Player settings could not be saved. Please try again."), "error");
    setEditing(false);
    notify("Player settings saved. Affected upcoming betting markets were suspended when required.");
    reload();
  }

  async function restore() {
    const { error } = await supabase.rpc("restore_player", { target_player_id: player.id });
    if (error) return notify(friendlyActionError(error, "The player could not be restored. Please try again."), "error");
    notify("Player restored to the active roster.");
    reload();
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-league-gold/30 bg-league-gold/[.07] p-3">
        <div className="grid gap-2">
          <TextInput value={name} onChange={e => setName(e.target.value)} />
          <Select value={position} onChange={e => setPosition(e.target.value as PlayerPosition)}>
            <option value="outfield">Outfield</option>
            <option value="goalkeeper">Goalkeeper</option>
          </Select>
          <Select value={playerType} onChange={event => {
            const type = event.target.value as PlayerType;
            setPlayerType(type);
            if (type === "guest") {
              setFantasyEligible(false);
              setBettingEligible(false);
            }
          }}>
            <option value="regular">Regular player</option>
            <option value="guest">Guest player</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-chalk/70"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-league-gold" /> Active</label>
          <EligibilityToggle checked={fantasyEligible} onChange={setFantasyEligible} title="Fantasy eligible" detail="Can be selected and earn Fantasy points." />
          <EligibilityToggle checked={bettingEligible} onChange={setBettingEligible} title="Individual betting eligible" detail="Can receive personal betting markets." />
          <div className="flex gap-2">
            <PrimaryButton type="button" onClick={save} className="flex-1">Save</PrimaryButton>
            <SecondaryButton type="button" onClick={() => setEditing(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-league-gold/15 bg-black/15 px-3 py-2">
      <button type="button" onClick={() => setEditing(true)} className="min-w-0 text-left">
        <div className="truncate font-semibold">{player.name}</div>
        <div className="text-xs uppercase tracking-wider text-chalk/45">{player.default_position} · {isGuestPlayer(player) ? "guest" : "regular"}{player.archived_at ? " · archived" : player.active ? "" : " · inactive"}</div>
        <div className="mt-0.5 text-[9px] text-chalk/30">Fantasy {isFantasyEligible(player) ? "on" : "off"} · Individual bets {isIndividualBettingEligible(player) ? "on" : "off"}</div>
      </button>
      {player.archived_at ? <button type="button" onClick={restore} className="rounded-xl border border-turf-400/30 px-3 py-1.5 text-xs font-bold text-turf-400">Restore</button> : <button type="button" onClick={() => onArchive(player.id)} className="rounded-xl p-2 text-chalk/45 hover:text-league-gold" aria-label={`Archive ${player.name}`}><Trash2 size={16} /></button>}
    </div>
  );
}

function EligibilityToggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (checked: boolean) => void; title: string; detail: string }) {
  return (
    <label className="flex items-start gap-2 rounded-xl border border-league-gold/15 bg-black/20 p-2.5 text-sm text-chalk/70">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1 accent-league-gold" />
      <span><span className="block font-semibold">{title}</span><span className="block text-xs leading-relaxed text-chalk/40">{detail}</span></span>
    </label>
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
  forceOpen,
  statsDirty,
  onStatsDirtyChange,
  notify,
  requestConfirm
}: {
  game: Game;
  data: LeagueData;
  reload: () => void;
  defaultOpen: boolean;
  forceOpen: boolean;
  statsDirty: boolean;
  onStatsDirtyChange: (gameId: string, dirty: boolean) => void;
  notify: (message: string, tone?: ToastTone) => void;
  requestConfirm: (state: NonNullable<ConfirmState>) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const events = data.events.filter(event => event.game_id === game.id);
  const playerStats = data.playerStats.filter(stat => stat.game_id === game.id);
  const score = calculateScore(events, lineups, playerStats);
  const lineupReady = gameLineupIsReady(game, lineups);

  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
    window.setTimeout(() => document.getElementById(`admin-game-${game.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [forceOpen, game.id]);

  function toggleOpen() {
    if (open && statsDirty) {
      if (!window.confirm(UNSAVED_CHANGES_MESSAGE)) return;
      onStatsDirtyChange(game.id, false);
    }
    setOpen(value => !value);
  }

  return (
    <section id={`admin-game-${game.id}`} className="scroll-mt-24 overflow-hidden rounded-[1.3rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-league-gold/[.035]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{statusLabel(game.status)}</Pill>
            <Pill className={lineupReady ? "border-turf-400/30 bg-turf-400/[.07] text-turf-400" : "border-league-gold/30 bg-league-gold/[.07] text-league-gold"}>
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
          <GameManager game={game} data={data} reload={reload} onStatsDirtyChange={onStatsDirtyChange} notify={notify} requestConfirm={requestConfirm} />
        </div>
      ) : null}
    </section>
  );
}

function GameManager({ game, data, reload, onStatsDirtyChange, notify, requestConfirm }: { game: Game; data: LeagueData; reload: () => void; onStatsDirtyChange: (gameId: string, dirty: boolean) => void; notify: (message: string, tone?: ToastTone) => void; requestConfirm: (state: NonNullable<ConfirmState>) => void }) {
  const currentLineup = useMemo(() => data.lineups.filter(l => l.game_id === game.id), [data.lineups, game.id]);
  const gameEvents = data.events.filter(e => e.game_id === game.id);
  const gamePlayerStats = data.playerStats.filter(stat => stat.game_id === game.id);
  const score = calculateScore(gameEvents, currentLineup, gamePlayerStats);
  const savedTeamAGoalkeeperMode = goalkeeperMode(game, "A");
  const savedTeamBGoalkeeperMode = goalkeeperMode(game, "B");
  const [lineupDraft, setLineupDraft] = useState<LineupDraft>({});
  const [lineupOpen, setLineupOpen] = useState(currentLineup.length === 0);
  const [dragPlayerId, setDragPlayerId] = useState<string | null>(null);
  const [teamAGoalkeeperMode, setTeamAGoalkeeperMode] = useState<GoalkeeperMode>(savedTeamAGoalkeeperMode);
  const [teamBGoalkeeperMode, setTeamBGoalkeeperMode] = useState<GoalkeeperMode>(savedTeamBGoalkeeperMode);
  const [potm, setPotm] = useState(game.potm_player_id || "");
  const [dateEdit, setDateEdit] = useState(toLocalDatetimeInput(game.game_date));
  const [correctionReason, setCorrectionReason] = useState("");
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [sendingLineupNotification, setSendingLineupNotification] = useState(false);
  const [statsDirty, setStatsDirty] = useState(false);
  const handleStatsDirtyChange = useCallback((dirty: boolean) => {
    setStatsDirty(dirty);
    onStatsDirtyChange(game.id, dirty);
  }, [game.id, onStatsDirtyChange]);

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
    setTeamAGoalkeeperMode(savedTeamAGoalkeeperMode);
    setTeamBGoalkeeperMode(savedTeamBGoalkeeperMode);
    setPotm(game.potm_player_id || "");
    setDateEdit(toLocalDatetimeInput(game.game_date));
  }, [game.id, game.game_date, game.potm_player_id, savedTeamAGoalkeeperMode, savedTeamBGoalkeeperMode, data.players, currentLineup]);

  const rosterPlayers = useMemo(
    () => data.players.filter(player => (player.active && !player.archived_at) || lineupDraft[player.id]?.team),
    [data.players, lineupDraft]
  );
  const selectedPlayers = useMemo(() => rosterPlayers.filter(p => lineupDraft[p.id]?.team), [rosterPlayers, lineupDraft]);
  const availablePlayers = useMemo(() => rosterPlayers.filter(p => !lineupDraft[p.id]?.team), [rosterPlayers, lineupDraft]);
  const teamAPlayers = useMemo(() => selectedPlayers.filter(p => lineupDraft[p.id]?.team === "A"), [selectedPlayers, lineupDraft]);
  const teamBPlayers = useMemo(() => selectedPlayers.filter(p => lineupDraft[p.id]?.team === "B"), [selectedPlayers, lineupDraft]);
  const lineupPlayers = useMemo(() => data.players.filter(player => currentLineup.some(lineup => lineup.player_id === player.id)), [data.players, currentLineup]);
  const teamAGoalkeepers = teamAPlayers.filter(player => draftValue(player).role === "goalkeeper").length;
  const teamBGoalkeepers = teamBPlayers.filter(player => draftValue(player).role === "goalkeeper").length;
  const lineupIssues = [
    teamAPlayers.length !== 5 ? `Team A needs exactly 5 players (${teamAPlayers.length}/5).` : null,
    teamBPlayers.length !== 5 ? `Team B needs exactly 5 players (${teamBPlayers.length}/5).` : null,
    teamAGoalkeeperMode === "fixed" && teamAGoalkeepers !== 1 ? `Team A fixed mode needs exactly one goalkeeper (${teamAGoalkeepers}/1).` : null,
    teamAGoalkeeperMode === "rotating" && teamAGoalkeepers !== 0 ? "Team A rotating mode uses five outfield players." : null,
    teamBGoalkeeperMode === "fixed" && teamBGoalkeepers !== 1 ? `Team B fixed mode needs exactly one goalkeeper (${teamBGoalkeepers}/1).` : null,
    teamBGoalkeeperMode === "rotating" && teamBGoalkeepers !== 0 ? "Team B rotating mode uses five outfield players." : null
  ].filter(Boolean) as string[];
  const lineupCanSave = lineupIssues.length === 0;
  const draftReady = lineupCanSave;
  const lineupReady = gameLineupIsReady(game, currentLineup);
  const canFinalize = lineupReady;
  const matchControlText = lineupReady
    ? "Lineups are ready. You can enter the result, set POTM, and control the match status."
    : draftReady
      ? "Save this lineup before starting the game or entering events."
      : "Save exactly 5 players on each team using either fixed or rotating goalkeeper mode.";

  function draftValue(player: Player) {
    return lineupDraft[player.id] || { team: null, role: player.default_position };
  }

  function movePlayer(playerId: string, team: TeamCode | null) {
    const player = data.players.find(p => p.id === playerId);
    if (!player) return;
    const targetMode = team === "A" ? teamAGoalkeeperMode : team === "B" ? teamBGoalkeeperMode : null;
    setLineupDraft(draft => ({
      ...draft,
      [playerId]: {
        team,
        role: targetMode === "rotating" ? "outfield" : draft[playerId]?.role || player.default_position
      }
    }));
  }

  function setRole(player: Player, role: PlayerPosition) {
    const value = draftValue(player);
    setLineupDraft(draft => ({ ...draft, [player.id]: { ...value, role } }));
  }

  function setGoalkeeperMode(team: TeamCode, mode: GoalkeeperMode) {
    if (team === "A") setTeamAGoalkeeperMode(mode);
    else setTeamBGoalkeeperMode(mode);
    if (mode === "rotating") {
      setLineupDraft(draft => Object.fromEntries(Object.entries(draft).map(([playerId, value]) => [
        playerId,
        value.team === team ? { ...value, role: "outfield" as PlayerPosition } : value
      ])));
    }
  }

  function handleDrop(e: React.DragEvent, team: TeamCode | null) {
    e.preventDefault();
    const playerId = e.dataTransfer.getData("text/plain") || dragPlayerId;
    if (playerId) movePlayer(playerId, team);
    setDragPlayerId(null);
  }

  async function saveLineup() {
    if (!lineupCanSave) {
      notify("Fix lineup issues before saving.", "warning");
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
    const { error } = await supabase.rpc("save_game_lineup_v2", {
      target_game_id: game.id,
      submitted_lineup: rows,
      team_a_mode: teamAGoalkeeperMode,
      team_b_mode: teamBGoalkeeperMode
    });
    if (error) return notify(friendlyActionError(error, "The lineup could not be saved. Please try again."), "error");
    setLineupOpen(false);
    if (firstPublication) {
      try {
        const result = await sendAdminGameNotification(game.id, "lineups_ready");
        notify(deliveryMessage("Lineup saved.", result));
      } catch (notificationError) {
        notify(`Lineup saved, but its notification failed: ${friendlyActionError(notificationError, "Unknown notification error.")}`, "warning");
      }
    } else {
      notify("Lineup saved. No new notification was sent for this edit.");
    }
    reload();
  }

  async function sendLineupNotification() {
    setSendingLineupNotification(true);
    try {
      const result = await sendAdminGameNotification(game.id, "lineups_ready");
      notify(deliveryMessage("Lineup notification checked.", result), result?.failed ? "warning" : "success");
    } catch (notificationError) {
      notify(`The lineup is saved, but its notification could not be sent: ${friendlyActionError(notificationError, "Unknown notification error.")}`, "warning");
    } finally {
      setSendingLineupNotification(false);
    }
  }

  async function updateStatus(status: Game["status"]) {
    if ((status === "live" || status === "final") && !lineupReady) {
      notify("Set and save exactly 5 players per team with a valid goalkeeper mode before changing the game status.", "warning");
      return;
    }
    if (status === "final" && !canFinalize) {
      notify("Cannot mark final before lineups are saved.", "warning");
      return;
    }
    const { error } = await supabase.rpc("set_game_status", { target_game_id: game.id, new_status: status });
    if (error) return notify(friendlyActionError(error, "The game status could not be changed. Please try again."), "error");
    if (status === "final") {
      try {
        const result = await sendAdminGameNotification(game.id, "result_finalized");
        notify(deliveryMessage("Game finalized and virtual bets settled.", result));
      } catch (notificationError) {
        notify(`Game and virtual bets were finalized, but the notification failed: ${friendlyActionError(notificationError, "Unknown notification error.")}`, "warning");
      }
    } else {
      notify(`Game marked ${statusLabel(status).toLowerCase()}.`);
    }
    reload();
  }

  function requestFinalization() {
    const warnings = [
      !game.potm_player_id ? "POTM is not set." : null,
      score.A === 0 && score.B === 0 ? "The score is 0–0; confirm that no goals or own goals are missing." : null,
      gamePlayerStats.every(stat => stat.saves === 0) ? "No saves are recorded; confirm that zero is correct." : null,
      potm !== (game.potm_player_id || "") ? "The current POTM selection has not been saved." : null,
      statsDirty ? "The statistics grid has unsaved changes." : null
    ].filter(Boolean);
    requestConfirm({
      title: "Finalize this game?",
      text: `Final score: Team A ${score.A} - ${score.B} Team B. POTM: ${playerName(data.players, game.potm_player_id)}.${warnings.length ? ` Check before finalizing: ${warnings.join(" ")}` : " All key result data is present."} Finalizing freezes a versioned result, settles all virtual bets in the same transaction, and locks the game until it is reopened with a correction reason.`,
      confirmLabel: "Finalize and settle",
      onConfirm: () => updateStatus("final")
    });
  }

  async function reopenForCorrection() {
    const { error } = await supabase.rpc("reopen_final_game", { target_game_id: game.id, correction_reason: correctionReason.trim() });
    if (error) return notify(friendlyActionError(error, "The game could not be reopened. Please try again."), "error");
    setReopenDialogOpen(false);
    setCorrectionReason("");
    notify("Game reopened for a controlled correction.");
    reload();
  }

  async function saveGameDetails() {
    if (!dateEdit) return;
    const { error } = await supabase.from("games").update({ game_date: new Date(dateEdit).toISOString() }).eq("id", game.id);
    if (error) return notify(friendlyActionError(error, "The game date could not be saved. Please try again."), "error");
    notify("Game date saved.");
    reload();
  }

  async function savePotm() {
    if (!lineupReady) return;
    const { error } = await supabase.from("games").update({ potm_player_id: potm || null }).eq("id", game.id);
    if (error) return notify(friendlyActionError(error, "POTM could not be saved. Please try again."), "error");
    notify("POTM saved.");
    reload();
  }

  async function deleteGame() {
    requestConfirm({
      title: "Delete game?",
      text: "This deletes the game and its lineups, events, fantasy squads, and picks.",
      confirmLabel: "Delete game",
      onConfirm: async () => {
        const { error } = await supabase.from("games").delete().eq("id", game.id);
        if (error) return notify(friendlyActionError(error, "The game could not be deleted. Please try again."), "error");
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
            <div className="flex flex-wrap gap-2">
              {lineupReady && (game.status === "draft" || game.status === "live") ? (
                <SecondaryButton type="button" disabled={sendingLineupNotification} onClick={() => void sendLineupNotification()} className="inline-flex items-center gap-2">
                  <BellRing size={16} />
                  {sendingLineupNotification ? "Sending..." : "Send lineup notification"}
                </SecondaryButton>
              ) : null}
              <PrimaryButton disabled={game.status === "final"} type="button" onClick={() => setLineupOpen(true)}>Edit lineup</PrimaryButton>
            </div>
          )}
        </div>

        {lineupOpen ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <GoalkeeperModeControl team="A" value={teamAGoalkeeperMode} onChange={mode => setGoalkeeperMode("A", mode)} />
              <GoalkeeperModeControl team="B" value={teamBGoalkeeperMode} onChange={mode => setGoalkeeperMode("B", mode)} />
            </div>
            <LineupValidation issues={lineupIssues} teamAMode={teamAGoalkeeperMode} teamBMode={teamBGoalkeeperMode} />
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_.9fr_1fr]">
              <TeamDropZone title="Team A" team="A" players={teamAPlayers} lineupDraft={lineupDraft} onDrop={handleDrop}>
                {teamAPlayers.map(player => <LineupPlayerCard key={player.id} player={player} value={draftValue(player)} goalkeeperMode={teamAGoalkeeperMode} onDragStart={setDragPlayerId} onMove={movePlayer} onRole={setRole} />)}
              </TeamDropZone>

              <TeamDropZone title="Available" team={null} players={availablePlayers} lineupDraft={lineupDraft} onDrop={handleDrop} compact>
                {availablePlayers.map(player => <LineupPlayerCard key={player.id} player={player} value={draftValue(player)} onDragStart={setDragPlayerId} onMove={movePlayer} onRole={setRole} compact />)}
              </TeamDropZone>

              <TeamDropZone title="Team B" team="B" players={teamBPlayers} lineupDraft={lineupDraft} onDrop={handleDrop}>
                {teamBPlayers.map(player => <LineupPlayerCard key={player.id} player={player} value={draftValue(player)} goalkeeperMode={teamBGoalkeeperMode} onDragStart={setDragPlayerId} onMove={movePlayer} onRole={setRole} />)}
              </TeamDropZone>
            </div>
          </>
        ) : (
          <SavedLineupSummary game={game} players={data.players} lineups={currentLineup} />
        )}
      </Card>

      <Card className={!lineupReady ? "border-league-gold/40" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-3xl uppercase">Match Control</h3>
            <p className="text-sm text-chalk/55">{matchControlText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {game.status === "final" ? <SecondaryButton type="button" onClick={() => setReopenDialogOpen(true)}>Reopen for correction</SecondaryButton> : <><SecondaryButton type="button" onClick={() => updateStatus("upcoming")}>Upcoming</SecondaryButton><SecondaryButton type="button" onClick={() => updateStatus("draft")}>Draft</SecondaryButton><PrimaryButton type="button" disabled={!lineupReady} onClick={() => updateStatus("live")}>Mark live</PrimaryButton><SecondaryButton type="button" disabled={!canFinalize || statsDirty} onClick={requestFinalization}>Finalize &amp; settle</SecondaryButton></>}
          </div>
        </div>

        {game.correction_open ? <div className="mt-4 rounded-2xl border border-league-gold/40 bg-league-gold/[.08] p-3 text-sm font-semibold text-league-gold">Correction mode is open{game.correction_reason ? `: ${game.correction_reason}` : "."} Review the result and finalize the game again when the corrections are complete.</div> : null}

        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.15fr]">
          <section className={cn("rounded-[1.2rem] border border-league-gold/18 bg-black/15 p-4", !lineupReady && "opacity-60")}>
            <div className="text-[9px] font-black uppercase tracking-[.17em] text-league-gold/60">Match award</div>
            <h4 className="mt-1 font-display text-2xl uppercase">Player of the Match</h4>
            <div className="mt-4 flex gap-2">
              <Select disabled={!lineupReady || game.status === "final"} value={potm} onChange={e => setPotm(e.target.value)}>
                <option value="">No POTM selected</option>
                {lineupPlayers.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
              </Select>
              <SecondaryButton className="whitespace-nowrap" type="button" disabled={!lineupReady || game.status === "final"} onClick={savePotm}>Save POTM</SecondaryButton>
            </div>
          </section>
          <section className="grid grid-cols-3 overflow-hidden rounded-[1.2rem] border border-league-gold/18 bg-black/15">
            <ResultSummary value={score.A} label="Team A" />
            <ResultSummary value={`${score.A}–${score.B}`} label="Current score" emphasized />
            <ResultSummary value={score.B} label="Team B" />
          </section>
        </div>

        <div className="mt-4">
          <AdminMatchStatsGrid game={game} data={data} lineups={currentLineup} disabled={!lineupReady || game.status === "final"} onSaved={reload} onDirtyChange={handleStatsDirtyChange} notify={notify} />
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
      className={cn("min-h-80 rounded-[1.2rem] border border-dashed border-league-gold/25 bg-black/20 p-3", compact && "xl:order-none")}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-2xl uppercase">{title}</h4>
        <Pill>{players.length}</Pill>
      </div>
      <div className="space-y-2">
        {players.length ? children : <div className="rounded-2xl border border-league-gold/15 bg-black/15 p-4 text-center text-sm text-chalk/45">Drop players here</div>}
      </div>
    </div>
  );
}

function GoalkeeperModeControl({ team, value, onChange }: { team: TeamCode; value: GoalkeeperMode; onChange: (mode: GoalkeeperMode) => void }) {
  return (
    <div className="rounded-[1rem] border border-league-gold/18 bg-black/15 p-3">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold">Team {team} goalkeeper</span><span className="text-[9px] uppercase tracking-wider text-chalk/30">{value === "fixed" ? "1 GK + 4 OUT" : "5 OUT"}</span></div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1">
        {(["fixed", "rotating"] as GoalkeeperMode[]).map(mode => <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)} className={cn("rounded-lg px-3 py-2 text-xs font-bold capitalize transition", value === mode ? "bg-league-gold text-gold-ink" : "text-chalk/45 hover:bg-chalk/[.035] hover:text-chalk")}>{mode}</button>)}
      </div>
    </div>
  );
}

function LineupValidation({ issues, teamAMode, teamBMode }: { issues: string[]; teamAMode: GoalkeeperMode; teamBMode: GoalkeeperMode }) {
  if (!issues.length) {
    return (
      <div className="mt-4 rounded-2xl border border-turf-400/30 bg-turf-400/[.07] p-3 text-sm font-semibold text-turf-400">
        Lineup is valid: Team A is {teamAMode} and Team B is {teamBMode}, with exactly five players each.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-league-gold/30 bg-league-gold/[.07] p-3 text-sm text-league-gold">
      <div className="font-bold">Fix before saving:</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {issues.map(issue => <li key={issue}>{issue}</li>)}
      </ul>
    </div>
  );
}

function SavedLineupSummary({ game, players, lineups }: { game: Game; players: Player[]; lineups: { player_id: string; team: TeamCode; role: PlayerPosition }[] }) {
  const teamA = lineups.filter(lineup => lineup.team === "A");
  const teamB = lineups.filter(lineup => lineup.team === "B");

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <SavedTeam title="Team A" mode={goalkeeperMode(game, "A")} players={players} lineups={teamA} />
      <SavedTeam title="Team B" mode={goalkeeperMode(game, "B")} players={players} lineups={teamB} />
    </div>
  );
}

function SavedTeam({ title, mode, players, lineups }: { title: string; mode: GoalkeeperMode; players: Player[]; lineups: { player_id: string; role: PlayerPosition }[] }) {
  const sorted = sortLineupsByRole(players, lineups.map((lineup, index) => ({
    id: `${lineup.player_id}-${index}`,
    game_id: "",
    team: "A",
    player_id: lineup.player_id,
    role: lineup.role
  })));

  return (
    <div className="rounded-[1.2rem] border border-league-gold/18 bg-black/15 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div><h4 className="font-display text-2xl uppercase">{title}</h4><div className="text-[9px] font-black uppercase tracking-wider text-league-gold/55">{mode} goalkeeper</div></div>
        <Pill>{lineups.length}/5</Pill>
      </div>
      <div className="space-y-2">
        {sorted.length ? sorted.map(lineup => (
          <div key={lineup.player_id} className="flex items-center justify-between rounded-2xl border border-league-gold/15 bg-black/20 px-3 py-2">
            <span className="font-semibold">{playerName(players, lineup.player_id)}</span>
            <span className="rounded-xl bg-league-gold/[.1] px-2 py-1 text-xs font-black uppercase text-league-gold">{lineup.role === "goalkeeper" ? "GK" : "OUT"}</span>
          </div>
        )) : <div className="rounded-2xl border border-league-gold/15 bg-black/20 p-4 text-sm text-chalk/45">No players saved.</div>}
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
  goalkeeperMode: mode,
  compact
}: {
  player: Player;
  value: { team: TeamCode | null; role: PlayerPosition };
  onDragStart: (id: string) => void;
  onMove: (playerId: string, team: TeamCode | null) => void;
  onRole: (player: Player, role: PlayerPosition) => void;
  goalkeeperMode?: GoalkeeperMode;
  compact?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData("text/plain", player.id);
        onDragStart(player.id);
      }}
      className="rounded-2xl border border-league-gold/15 bg-black/20 p-3"
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
      {mode === "rotating" ? <div className="mt-3 rounded-xl border border-turf-400/15 bg-turf-400/[.045] px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-turf-100/70">Outfield · rotating keeper</div> : (
        <div className={cn("mt-3 grid grid-cols-2 gap-2", compact && "opacity-80")}>
          <RoleButton active={value.role === "outfield"} onClick={() => onRole(player, "outfield")}>OUT</RoleButton>
          <RoleButton active={value.role === "goalkeeper"} onClick={() => onRole(player, "goalkeeper")}>GK</RoleButton>
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <MoveButton active={value.team === "A"} onClick={() => onMove(player.id, "A")}>Team A</MoveButton>
        <MoveButton active={value.team === "B"} onClick={() => onMove(player.id, "B")}>Team B</MoveButton>
        <MoveButton active={!value.team} onClick={() => onMove(player.id, null)}>Out</MoveButton>
      </div>
    </div>
  );
}

function ResultSummary({ value, label, emphasized = false }: { value: number | string; label: string; emphasized?: boolean }) {
  return <div className={cn("grid min-h-28 place-items-center border-r border-league-gold/12 p-3 text-center last:border-r-0", emphasized && "bg-league-gold/[.045]")}><div><div className={cn("font-mono font-black", emphasized ? "text-3xl text-league-gold" : "text-2xl")}>{value}</div><div className="mt-1 text-[8px] font-black uppercase tracking-wider text-chalk/30">{label}</div></div></div>;
}

function MoveButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  const { active, className, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "rounded-xl border border-league-gold/15 px-2 py-2 text-xs font-bold transition hover:border-league-gold/50",
        active ? "bg-league-gold text-gold-ink" : "bg-black/20 text-chalk/60",
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
        "rounded-xl border border-league-gold/15 px-3 py-2 text-sm font-black transition hover:border-league-gold/60",
        active ? "bg-league-gold text-gold-ink" : "bg-black/20 text-chalk/65",
        className
      )}
    />
  );
}
