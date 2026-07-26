"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Crown, Pencil, Plus, X } from "lucide-react";
import { GameLineup, FantasyPick, Player, PlayerPosition } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isFantasyEligible } from "@/lib/playerEligibility";
import { Modal, PrimaryButton, SecondaryButton, Toast } from "./ui";

const outfieldSlots = [
  { x: 25, y: 27 },
  { x: 75, y: 27 },
  { x: 29, y: 56 },
  { x: 71, y: 56 }
];
const noGkSlots = [
  { x: 50, y: 18 },
  { x: 23, y: 43 },
  { x: 77, y: 43 },
  { x: 31, y: 70 },
  { x: 69, y: 70 }
];
const gkSlot = { x: 50, y: 84 };

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
  const eligiblePlayerIds = new Set(players.filter(isFantasyEligible).map(player => player.id));
  const eligibleGoalkeeperIds = new Set(
    [...lineups, ...extraPlayers]
      .filter(player => eligiblePlayerIds.has(player.player_id) && player.role === "goalkeeper")
      .map(player => player.player_id)
  );
  const requiresGoalkeeper = eligibleGoalkeeperIds.size >= 2;
  const slots = requiresGoalkeeper ? [...outfieldSlots, gkSlot] : noGkSlots;
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [editing, setEditing] = useState(initialPicks.length !== 5 && !locked);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPick[]>(
    initialPicks.map(pick => ({ slot_index: pick.slot_index, player_id: pick.player_id, role: pick.role, is_captain: pick.is_captain }))
  );

  useEffect(() => {
    setDraft(initialPicks.map(pick => ({ slot_index: pick.slot_index, player_id: pick.player_id, role: pick.role, is_captain: pick.is_captain })));
    setEditing(initialPicks.length !== 5 && !locked);
    setSelectedSlot(null);
  }, [initialPicks, locked]);

  const pool = useMemo(() => {
    return [
      ...lineups.map(lineup => ({ player_id: lineup.player_id, role: lineup.role, team: lineup.team, player: players.find(player => player.id === lineup.player_id) })),
      ...extraPlayers
        .filter(extra => !lineups.some(lineup => lineup.player_id === extra.player_id))
        .map(extra => ({ player_id: extra.player_id, role: extra.role, team: null, player: players.find(player => player.id === extra.player_id) }))
    ]
      .filter(item => item.player && isFantasyEligible(item.player))
      .sort((first, second) => first.player!.name.localeCompare(second.player!.name));
  }, [extraPlayers, lineups, players]);

  const captainExists = draft.some(pick => pick.is_captain);
  const selectingCaptain = editing && draft.length === 5 && !captainExists;

  function slotRole(index: number): PlayerPosition {
    return requiresGoalkeeper && index === 4 ? "goalkeeper" : "outfield";
  }

  function pickForSlot(index: number) {
    return draft.find(pick => pick.slot_index === index);
  }

  function playerForSlot(index: number) {
    const pick = pickForSlot(index);
    return pick ? players.find(player => player.id === pick.player_id) || null : null;
  }

  function openSlot(index: number) {
    if (locked || !editing) return;
    if (selectingCaptain) {
      setCaptain(index);
      return;
    }
    setSelectedSlot(index);
  }

  function choosePlayer(playerId: string) {
    if (selectedSlot == null || locked || !editing) return;
    const selectedPlayer = pool.find(item => item.player_id === playerId);
    if (!selectedPlayer) return;
    const role = selectedPlayer.role;
    setDraft(current => {
      const replacedPick = current.find(pick => pick.slot_index === selectedSlot);
      const withoutSlotOrPlayer = current.filter(pick => pick.slot_index !== selectedSlot && pick.player_id !== playerId);
      return [...withoutSlotOrPlayer, { slot_index: selectedSlot, player_id: playerId, role, is_captain: replacedPick?.is_captain || false }]
        .sort((first, second) => first.slot_index - second.slot_index);
    });
    setMessage(null);
    setSelectedSlot(null);
  }

  function removeSlot(index: number) {
    if (!editing || locked) return;
    setDraft(current => current.filter(pick => pick.slot_index !== index));
    setMessage(null);
  }

  function setCaptain(index: number) {
    const pick = pickForSlot(index);
    if (!pick || locked || !editing) return;
    setDraft(current => current.map(item => ({ ...item, is_captain: item.slot_index === index })));
    setMessage(null);
  }

  async function save() {
    setMessage(null);
    if (draft.length !== 5) return setMessage("Pick all 5 slots first.");
    if (requiresGoalkeeper && draft.filter(pick => pick.role === "goalkeeper").length !== 1) return setMessage("You need 1 goalkeeper.");
    if (!captainExists) return setMessage("Choose a captain before saving.");

    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setSelectedSlot(null);
      setToast("Picks saved.");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not save picks.");
    } finally {
      setSaving(false);
    }
  }

  const candidates = selectedSlot == null
    ? []
    : requiresGoalkeeper
      ? pool.filter(item => item.role === slotRole(selectedSlot))
      : pool;

  return (
    <div className="mx-auto max-w-3xl">
      <Toast message={toast} onDone={() => setToast(null)} />
      <Modal open={selectedSlot != null && !selectingCaptain} title="Choose a player" onClose={() => setSelectedSlot(null)}>
        <div className="flex items-start justify-between gap-4">
          <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/70">Slot {selectedSlot == null ? "" : selectedSlot + 1}</div><h2 className="mt-1 font-display text-3xl uppercase">Choose a player</h2><p className="mt-1 text-sm text-chalk/45">{requiresGoalkeeper && selectedSlot != null && slotRole(selectedSlot) === "goalkeeper" ? "Goalkeepers available for this match" : requiresGoalkeeper ? "Outfield players available for this match" : "All eligible lineup players are available"}</p></div>
          <button type="button" onClick={() => setSelectedSlot(null)} aria-label="Close player selection" className="rounded-xl border border-chalk/[.07] p-2 text-chalk/40 transition hover:bg-chalk/[.04] hover:text-chalk"><X size={17} /></button>
        </div>
        <div className="mt-5 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {candidates.map(item => {
            const alreadyPicked = draft.some(pick => pick.player_id === item.player!.id);
            return <button key={item.player!.id} type="button" onClick={() => choosePlayer(item.player!.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-chalk/[.07] bg-chalk/[.025] px-3 py-3 text-left transition hover:border-league-gold/35 hover:bg-league-gold/[.055] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"><span className="min-w-0 truncate font-semibold">{item.player!.name}</span><span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-chalk/35">{alreadyPicked ? "Swap" : item.team ? `Team ${item.team}` : "Available"}</span></button>;
          })}
          {!candidates.length ? <p className="rounded-xl border border-dashed border-chalk/10 p-6 text-center text-sm text-chalk/40">No eligible players are available for this slot.</p> : null}
        </div>
      </Modal>

      <section className="relative aspect-[4/5] w-full min-w-0 overflow-hidden rounded-[1.7rem] border-2 border-league-gold/40 bg-[#0b3e22] shadow-[0_16px_38px_rgba(0,0,0,.25),inset_0_0_45px_rgba(0,0,0,.24)] sm:min-h-[540px]" aria-label="Fantasy team selection pitch">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,.025)_0%,rgba(255,255,255,.025)_10%,rgba(0,0,0,.025)_10%,rgba(0,0,0,.025)_20%)]" />
        <div className="absolute inset-3 rounded-[1.25rem] border border-pitch-line/45" />
        <div className="absolute inset-x-3 top-1/2 border-t border-pitch-line/45" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-pitch-line/45 md:h-28 md:w-28" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pitch-line/60" />
        <div className="absolute left-1/2 top-3 h-16 w-36 -translate-x-1/2 rounded-b-2xl border-x border-b border-pitch-line/45 md:h-20 md:w-44" />
        <div className="absolute bottom-3 left-1/2 h-16 w-36 -translate-x-1/2 rounded-t-2xl border-x border-t border-pitch-line/45 md:h-20 md:w-44" />

        <div className="absolute left-5 top-5 z-10 rounded-full border border-pitch-line/10 bg-[#11110f]/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-pitch-line/60 backdrop-blur">{requiresGoalkeeper ? "4 outfield · 1 goalkeeper" : "5 flexible picks"}</div>
        {!editing && !locked ? <button type="button" onClick={() => { setMessage(null); setEditing(true); }} className="absolute right-5 top-5 z-40 inline-flex items-center gap-1.5 rounded-full border border-[#daa520]/25 bg-[#11110f]/85 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#daa520] backdrop-blur transition hover:bg-[#daa520]/10"><Pencil size={12} /> Edit picks</button> : null}

        {selectingCaptain ? <><div className="absolute inset-0 z-20 bg-[#07130c]/75 backdrop-blur-[1px]" /><div className="pointer-events-none absolute inset-x-4 top-[43%] z-40 -translate-y-1/2 text-center"><div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-league-gold text-[#11110f]"><Crown size={19} /></div><h3 className="mt-3 font-display text-3xl uppercase text-pitch-line sm:text-4xl">Select your captain</h3><p className="mt-1 text-xs text-pitch-line/55">Tap one of your five players</p></div></> : null}

        {slots.map((slot, index) => {
          const player = playerForSlot(index);
          const pick = pickForSlot(index);
          const role = pick?.role || slotRole(index);
          return (
            <button
              type="button"
              key={index}
              disabled={locked || !editing}
              onClick={() => openSlot(index)}
              aria-label={player ? `${player.name}${pick?.is_captain ? ", captain" : ""}` : `Choose ${requiresGoalkeeper ? role : "player"} for slot ${index + 1}`}
              className={cn("group absolute z-10 w-[5.8rem] -translate-x-1/2 -translate-y-1/2 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:w-28", selectingCaptain && "z-50 hover:-translate-y-[54%] hover:scale-105", editing && !selectingCaptain && "hover:-translate-y-[54%]", !player && "opacity-60 hover:opacity-100")}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              <span className="relative mx-auto block h-[4.9rem] w-[4.9rem] sm:h-[5.8rem] sm:w-[5.8rem]">
                <Image src={role === "goalkeeper" ? "/fantasy/goalkeeper-jersey.png" : "/fantasy/outfield-jersey.png"} alt="" fill sizes="96px" className={cn("object-contain drop-shadow-[0_9px_9px_rgba(0,0,0,.4)]", !player && "grayscale opacity-45")} />
                {!player ? <span className="absolute inset-0 grid place-items-center"><span className="grid h-7 w-7 place-items-center rounded-full border border-pitch-line/25 bg-[#11110f]/80 text-pitch-line"><Plus size={15} /></span></span> : null}
                {pick?.is_captain ? <span className="absolute -right-1 top-0 grid h-7 w-7 place-items-center rounded-full border-2 border-[#0b3e22] bg-[#daa520] text-[#11110f] shadow-lg"><Crown size={14} /></span> : null}
                {editing && player && !selectingCaptain ? <span role="button" tabIndex={0} aria-label={`Remove ${player.name}`} onClick={event => { event.stopPropagation(); removeSlot(index); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); removeSlot(index); } }} className="absolute -left-1 top-0 grid h-6 w-6 place-items-center rounded-full border border-pitch-line/15 bg-[#11110f]/90 text-pitch-line/55 transition hover:text-pitch-line"><X size={12} /></span> : null}
              </span>
              <span className={cn("mx-auto -mt-1 block max-w-full truncate rounded-lg border px-2 py-1 text-[10px] font-bold shadow-lg backdrop-blur sm:text-xs", player ? "border-pitch-line/10 bg-[#11110f]/90 text-pitch-line" : "border-dashed border-pitch-line/15 bg-black/35 text-pitch-line/55")}>{player?.name || (requiresGoalkeeper && role === "goalkeeper" ? "Pick GK" : "Pick player")}</span>
            </button>
          );
        })}
      </section>

      {locked ? <div className="mt-3 rounded-xl border border-chalk/[.07] bg-ink-850 px-4 py-3 text-center text-sm text-chalk/45">Picks are locked for this match.</div> : null}
      {message ? <div className="mt-3 rounded-xl border border-league-gold/20 bg-league-gold/[.055] px-4 py-3 text-center text-sm text-chalk/70">{message}</div> : null}
      {editing && captainExists && !locked ? <div className="mt-4 flex gap-2"><PrimaryButton type="button" onClick={save} disabled={saving} className="flex-1 rounded-xl py-3">{saving ? "Saving..." : "Save picks"}</PrimaryButton><SecondaryButton type="button" onClick={() => { setDraft([]); setMessage(null); }} disabled={saving} className="rounded-xl px-4">Clear</SecondaryButton></div> : null}
      {!editing && draft.length === 5 ? <p className="mt-3 text-center text-xs text-chalk/35">Your team is saved{locked ? " and can no longer be edited" : ""}.</p> : null}
    </div>
  );
}
