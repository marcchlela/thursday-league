"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, X } from "lucide-react";
import { GameLineup, FantasyPick, Player, PlayerPosition } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PrimaryButton, SecondaryButton, Toast } from "./ui";

const outfieldSlots = [
  { x: 25, y: 28 },
  { x: 75, y: 28 },
  { x: 30, y: 55 },
  { x: 70, y: 55 }
];
const noGkSlots = [
  { x: 50, y: 18 },
  { x: 22, y: 42 },
  { x: 78, y: 42 },
  { x: 32, y: 68 },
  { x: 68, y: 68 }
];
const gkSlot = { x: 50, y: 83 };

type DraftPick = {
  slot_index: number;
  player_id: string;
  role: PlayerPosition;
  is_captain: boolean;
};

type ExtraFantasyPlayer = {
  player_id: string;
  role: PlayerPosition;
};

export function PitchPicker({
  players,
  lineups,
  extraPlayers = [],
  initialPicks,
  locked,
  onSave
}: {
  players: Player[];
  lineups: GameLineup[];
  extraPlayers?: ExtraFantasyPlayer[];
  initialPicks: FantasyPick[];
  locked: boolean;
  onSave: (picks: DraftPick[]) => Promise<void>;
}) {
  const hasGk = [...lineups, ...extraPlayers].some(player => player.role === "goalkeeper");
  const slots = hasGk ? [...outfieldSlots, gkSlot] : noGkSlots;
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [editing, setEditing] = useState(initialPicks.length !== 5 && !locked);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPick[]>(
    initialPicks.map(p => ({ slot_index: p.slot_index, player_id: p.player_id, role: p.role, is_captain: p.is_captain }))
  );

  useEffect(() => {
    setDraft(initialPicks.map(p => ({ slot_index: p.slot_index, player_id: p.player_id, role: p.role, is_captain: p.is_captain })));
    setEditing(initialPicks.length !== 5 && !locked);
    setSelectedSlot(null);
  }, [initialPicks, locked]);

  const pool = useMemo(() => {
    return [
      ...lineups.map(lineup => ({ player_id: lineup.player_id, role: lineup.role, team: lineup.team, player: players.find(p => p.id === lineup.player_id) })),
      ...extraPlayers
        .filter(extra => !lineups.some(lineup => lineup.player_id === extra.player_id))
        .map(extra => ({ player_id: extra.player_id, role: extra.role, team: null, player: players.find(p => p.id === extra.player_id) }))
    ]
      .filter(item => item.player)
      .sort((a, b) => a.player!.name.localeCompare(b.player!.name));
  }, [extraPlayers, lineups, players]);

  const captainExists = draft.some(p => p.is_captain);

  function slotRole(index: number): PlayerPosition {
    return hasGk && index === 4 ? "goalkeeper" : "outfield";
  }

  function playerForSlot(index: number) {
    const pick = draft.find(p => p.slot_index === index);
    if (!pick) return null;
    return players.find(p => p.id === pick.player_id) || null;
  }

  function choosePlayer(playerId: string) {
    if (selectedSlot == null || locked || !editing) return;
    const role = slotRole(selectedSlot);
    setDraft(current => {
      const withoutSlotOrPlayer = current.filter(p => p.slot_index !== selectedSlot && p.player_id !== playerId);
      return [...withoutSlotOrPlayer, { slot_index: selectedSlot, player_id: playerId, role, is_captain: current.find(p => p.player_id === playerId)?.is_captain || false }]
        .sort((a, b) => a.slot_index - b.slot_index);
    });
    setSelectedSlot(null);
  }

  function removeSlot(index: number) {
    if (!editing) return;
    setDraft(current => current.filter(p => p.slot_index !== index));
  }

  function setCaptain(index: number) {
    const pick = draft.find(p => p.slot_index === index);
    if (!pick || locked || !editing) return;
    setDraft(current => current.map(p => ({ ...p, is_captain: p.slot_index === index })));
  }

  async function save() {
    setMessage(null);
    if (draft.length !== 5) return setMessage("Pick all 5 slots first.");
    if (hasGk && draft.filter(p => p.role === "goalkeeper").length !== 1) return setMessage("You need 1 goalkeeper.");
    if (!hasGk && draft.some(p => p.role === "goalkeeper")) return setMessage("This week is 5 outfield picks.");
    if (!captainExists) return setMessage("Choose a captain before saving.");

    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setSelectedSlot(null);
      setToast("Picks saved.");
    } catch (error: any) {
      setMessage(error.message || "Could not save picks.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <Toast message={toast} onDone={() => setToast(null)} />
      <div className="pitch relative aspect-[3/4] min-h-[560px] overflow-hidden rounded-[2rem] border-[10px] border-perimeter-500 shadow-glow">
        <div className="absolute left-0 right-0 top-1/2 h-px border-t-2 border-chalk/80" />
        <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-chalk/75" />
        <div className="absolute bottom-0 left-1/2 h-24 w-44 -translate-x-1/2 rounded-t-3xl border-2 border-b-0 border-chalk/75" />
        <div className="absolute top-0 left-1/2 h-20 w-40 -translate-x-1/2 rounded-b-3xl border-2 border-t-0 border-chalk/60" />
        <div className="absolute inset-5 rounded-[1.4rem] border-2 border-chalk/75" />

        {slots.map((slot, index) => {
          const player = playerForSlot(index);
          const pick = draft.find(p => p.slot_index === index);
          const role = slotRole(index);
          return (
            <button
              type="button"
              key={index}
              disabled={locked || !editing}
              onClick={() => setSelectedSlot(index)}
              className={cn("absolute z-10 w-32 -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-3 py-3 text-center shadow-xl transition", player ? "border-perimeter-400 bg-ink-900/90" : "border-dashed border-chalk/55 bg-black/25", editing && !player && "hover:bg-perimeter-400/15", selectedSlot === index && "ring-4 ring-floodlight/60")}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              {pick?.is_captain ? <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-floodlight text-ink-900 shadow-amber"><Crown size={15} /></span> : null}
              <div className="text-[10px] font-bold uppercase tracking-wider text-chalk/45">{role === "goalkeeper" ? "GK" : "Outfield"}</div>
              <div className="mt-1 truncate font-display text-lg uppercase leading-none text-chalk">{player?.name || (editing ? "Tap to pick" : "Empty slot")}</div>
            </button>
          );
        })}
      </div>

      <div className="panel rounded-[2rem] border border-white/10 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-3xl uppercase">Set Team</h3>
            <p className="text-sm text-chalk/55">{editing ? (hasGk ? "4 outfield + 1 GK" : "No GK listed: pick 5 outfield") : "Your saved squad is shown on the pitch."}</p>
          </div>
          <span className="font-mono text-2xl">{draft.length}/5</span>
        </div>

        {locked ? <div className="mt-4 rounded-2xl border border-floodlight/30 bg-floodlight/10 p-3 text-sm text-floodlight">Your picks are read-only now. The game is live or final.</div> : null}

        {editing ? (
          <>
            <div className="mt-5 space-y-2">
              {slots.map((_slot, index) => {
                const player = playerForSlot(index);
                const pick = draft.find(p => p.slot_index === index);
                return (
                  <div key={index} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                    <button type="button" disabled={locked || !player} onClick={() => setCaptain(index)} className={cn("grid h-9 w-9 place-items-center rounded-xl border border-white/10", pick?.is_captain && "border-floodlight bg-floodlight text-ink-900")}>C</button>
                    <button type="button" disabled={locked} onClick={() => setSelectedSlot(index)} className="min-w-0 flex-1 text-left">
                      <div className="truncate font-semibold">{player?.name || `Slot ${index + 1}`}</div>
                      <div className="text-xs text-chalk/45">{slotRole(index) === "goalkeeper" ? "Goalkeeper" : "Outfield"}</div>
                    </button>
                    {!locked && player ? <button type="button" onClick={() => removeSlot(index)} className="rounded-xl p-2 text-chalk/45 hover:text-chalk"><X size={16} /></button> : null}
                  </div>
                );
              })}
            </div>

            {selectedSlot != null && !locked ? (
              <div className="mt-5 rounded-3xl border border-perimeter-400/30 bg-perimeter-400/10 p-3">
                <p className="mb-2 text-sm font-bold text-perimeter-400">Choose for slot {selectedSlot + 1}</p>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {pool
                    .filter(item => item.role === slotRole(selectedSlot))
                    .map(item => {
                      const alreadyPicked = draft.some(p => p.player_id === item.player!.id);
                      return (
                        <button key={item.player!.id} type="button" onClick={() => choosePlayer(item.player!.id)} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-white/10">
                          <span>{item.player!.name}</span>
                          <span className="text-xs text-chalk/45">{item.team ? `Team ${item.team}` : "Late addition"}{alreadyPicked ? " - swap" : ""}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : null}

            {message ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-chalk/70">{message}</div> : null}
            <div className="mt-5 flex gap-3">
              <PrimaryButton onClick={save} disabled={saving || locked} className="flex-1">{saving ? "Saving..." : "Save picks"}</PrimaryButton>
              <SecondaryButton onClick={() => setDraft([])} disabled={locked}>Clear</SecondaryButton>
            </div>
          </>
        ) : (
          <SavedPicksPanel draft={draft} players={players} locked={locked} onEdit={() => { setMessage(null); setEditing(true); }} />
        )}
      </div>
    </div>
  );
}

function SavedPicksPanel({
  draft,
  players,
  locked,
  onEdit
}: {
  draft: DraftPick[];
  players: Player[];
  locked: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-3xl border border-perimeter-400/25 bg-perimeter-400/10 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="font-display text-2xl uppercase">Saved Picks</h4>
          <span className="font-mono text-xl">{draft.length}/5</span>
        </div>
        <div className="space-y-2">
          {draft
            .slice()
            .sort((a, b) => a.slot_index - b.slot_index)
            .map(pick => {
              const player = players.find(p => p.id === pick.player_id);
              return (
                <div key={pick.slot_index} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="truncate font-semibold">
                    {player?.name || "Unknown player"}
                    {pick.is_captain ? <span className="ml-2 rounded-full bg-floodlight px-2 py-0.5 text-xs text-ink-900">C</span> : null}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-chalk/45">{pick.role === "goalkeeper" ? "Goalkeeper" : "Outfield"}</div>
                </div>
              );
            })}
        </div>
      </div>
      <PrimaryButton type="button" onClick={onEdit} disabled={locked} className="w-full">{locked ? "Picks locked" : "Edit picks"}</PrimaryButton>
    </div>
  );
}
