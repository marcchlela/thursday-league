import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FootballPitch, fantasyFlexibleSlots, fantasyGoalkeeperSlots, PitchPlayer } from '@/components/FootballPitch';
import { TeamCrest } from '@/components/TeamCrest';
import { Button, Icon } from '@/components/ui';
import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import type { GameLineup, Player, PlayerPosition, TeamCode } from '@/lib/types';

export type FantasyDraftPick = { player_id: string; role: PlayerPosition; is_captain: boolean; slot_index: number };

export function FantasyPitchPicker({
  gameId,
  players,
  lineups,
  value,
  onChange,
  onSave,
  locked,
  saving,
}: {
  gameId: string;
  players: Player[];
  lineups: GameLineup[];
  value: FantasyDraftPick[];
  onChange: (next: FantasyDraftPick[]) => void;
  onSave: () => void;
  locked: boolean;
  saving: boolean;
}) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const pool = useMemo(() => lineups
    .map(lineup => ({ ...lineup, player: players.find(player => player.id === lineup.player_id) }))
    .filter((row): row is GameLineup & { player: Player } => !!row.player && row.player.active && row.player.fantasy_eligible !== false && !(row.player.fantasy_eligible == null && row.player.competition_eligible === false)), [lineups, players]);
  const requiresGoalkeeper = new Set(pool.filter(row => row.role === 'goalkeeper').map(row => row.player_id)).size >= 2;
  const slots = requiresGoalkeeper ? fantasyGoalkeeperSlots : fantasyFlexibleSlots;
  const captainExists = value.some(pick => pick.is_captain);
  const selectingCaptain = !locked && value.length === 5 && !captainExists;
  const roleForSlot = (index: number): PlayerPosition => requiresGoalkeeper && index === 4 ? 'goalkeeper' : 'outfield';
  const pickForSlot = (index: number) => value.find(pick => pick.slot_index === index);
  const playerForSlot = (index: number) => {
    const pick = pickForSlot(index);
    return pick ? players.find(player => player.id === pick.player_id) || null : null;
  };
  const candidates = selectedSlot == null ? [] : requiresGoalkeeper ? pool.filter(row => row.role === roleForSlot(selectedSlot)) : pool;
  const groups = (['A', 'B'] as TeamCode[]).map(team => ({ team, rows: candidates.filter(row => row.team === team) })).filter(group => group.rows.length);

  function openSlot(index: number) {
    if (locked) return;
    if (selectingCaptain) {
      const selected = pickForSlot(index);
      if (selected) onChange(value.map(pick => ({ ...pick, is_captain: pick.slot_index === index })));
      return;
    }
    setSelectedSlot(index);
  }

  function choose(row: GameLineup) {
    if (selectedSlot == null) return;
    const replaced = pickForSlot(selectedSlot);
    const next = value
      .filter(pick => pick.slot_index !== selectedSlot && pick.player_id !== row.player_id)
      .concat({ player_id: row.player_id, role: row.role, slot_index: selectedSlot, is_captain: replaced?.is_captain || false })
      .sort((a, b) => a.slot_index - b.slot_index);
    onChange(next);
    setSelectedSlot(null);
  }

  function removeSelected() {
    if (selectedSlot == null) return;
    onChange(value.filter(pick => pick.slot_index !== selectedSlot));
    setSelectedSlot(null);
  }

  return (
    <View style={styles.wrap}>
      <FootballPitch label="Fantasy team selection pitch">
        <View style={styles.pitchLabel}><Text style={styles.pitchLabelText}>{requiresGoalkeeper ? '4 OUTFIELD · 1 GOALKEEPER' : '5 FLEXIBLE PICKS'}</Text></View>
        {selectingCaptain ? <View pointerEvents="none" style={styles.captainPrompt}><View style={styles.crown}><Icon name={{ ios: 'crown.fill', android: 'workspace_premium' }} color={colors.goldInk} size={17} /></View><Text style={styles.captainTitle}>SELECT YOUR CAPTAIN</Text><Text style={styles.captainHelp}>Tap one of your five players</Text></View> : null}
        {slots.map((slot, index) => {
          const pick = pickForSlot(index);
          const player = playerForSlot(index);
          return <PitchPlayer key={index} x={slot.x} y={slot.y} name={player?.name || (requiresGoalkeeper && index === 4 ? 'Pick GK' : 'Pick player')} role={pick?.role || roleForSlot(index)} team={pool.find(row => row.player_id === pick?.player_id)?.team || 'A'} captain={pick?.is_captain} empty={!player} onPress={() => openSlot(index)} />;
        })}
      </FootballPitch>

      {locked ? <View style={styles.locked}><Text style={styles.lockedText}>Picks are locked for this match.</Text></View> : (
        <View style={styles.saveBar}>
          <View style={styles.progressRow}><Text style={styles.progress}>{value.length}/5 players selected</Text><Text style={[styles.captainStatus, captainExists && styles.ready]}>{captainExists ? 'Captain selected' : value.length === 5 ? 'Choose a captain' : 'Captain needed'}</Text></View>
          <View style={styles.actions}><View style={styles.save}><Button onPress={onSave} disabled={saving || value.length !== 5 || !captainExists}>{saving ? 'Saving...' : value.length !== 5 ? `Select ${5 - value.length} more` : !captainExists ? 'Choose a captain' : 'Save picks'}</Button></View><Pressable accessibilityRole="button" accessibilityLabel="Clear picks" disabled={!value.length || saving} onPress={() => onChange([])} style={[styles.clear, (!value.length || saving) && styles.disabled]}><Text style={styles.clearText}>Clear</Text></Pressable></View>
        </View>
      )}

      <Modal visible={selectedSlot != null} transparent animationType="fade" onRequestClose={() => setSelectedSlot(null)}>
        <Pressable style={styles.scrim} onPress={() => setSelectedSlot(null)}>
          <Pressable style={styles.modal} onPress={() => undefined}>
            <View style={styles.modalHead}><View style={styles.modalCopy}><Text style={styles.modalEyebrow}>SLOT {selectedSlot == null ? '' : selectedSlot + 1}</Text><Text style={styles.modalTitle}>CHOOSE A PLAYER</Text><Text style={styles.modalHelp}>{requiresGoalkeeper && selectedSlot != null && roleForSlot(selectedSlot) === 'goalkeeper' ? 'Goalkeepers available for this match' : requiresGoalkeeper ? 'Outfield players available for this match' : 'All eligible lineup players are available'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close player selection" onPress={() => setSelectedSlot(null)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalList}>
              {selectedSlot != null && playerForSlot(selectedSlot) ? <Pressable onPress={removeSelected} style={styles.remove}><Text style={styles.removeText}>Remove {playerForSlot(selectedSlot)?.name}</Text></Pressable> : null}
              {groups.map(group => <View key={group.team} style={styles.group}><View style={styles.groupHead}><TeamCrest gameId={gameId} team={group.team} size={34} /><Text style={styles.groupTitle}>TEAM {group.team}</Text><Text style={styles.groupCount}>{group.rows.length}</Text></View>{group.rows.map(row => { const picked = value.some(pick => pick.player_id === row.player_id); return <Pressable key={row.player_id} onPress={() => choose(row)} style={styles.candidate}><Avatar name={row.player.name} size={36} /><Text numberOfLines={1} style={styles.candidateName}>{row.player.name}</Text><Text style={[styles.candidateMeta, picked && styles.candidatePicked]}>{picked ? '✓ SELECTED' : row.role === 'goalkeeper' ? 'GK' : 'OUT'}</Text></Pressable>; })}</View>)}
              {!candidates.length ? <Text style={styles.noCandidates}>No eligible players are available for this slot.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  pitchLabel: { position: 'absolute', left: 20, top: 20, zIndex: 20, borderWidth: 1, borderColor: 'rgba(239,255,237,0.1)', borderRadius: radius.pill, backgroundColor: 'rgba(17,17,15,0.72)', paddingHorizontal: 11, paddingVertical: 7 },
  pitchLabelText: { color: 'rgba(239,255,237,0.62)', fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.1 },
  captainPrompt: { ...StyleSheet.absoluteFill, zIndex: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,19,12,0.72)' },
  crown: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.gold },
  captainTitle: { marginTop: 12, color: '#EFFFF1', fontFamily: fonts.displayBold, fontSize: 29 },
  captainHelp: { marginTop: 2, color: 'rgba(239,255,237,0.58)', fontFamily: fonts.sans, fontSize: 10 },
  locked: { borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, backgroundColor: colors.ink850, padding: 13 },
  lockedText: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 12, textAlign: 'center' },
  saveBar: { ...shadows.floating, borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: 19, backgroundColor: 'rgba(17,17,15,0.97)', padding: 12, gap: spacing.sm },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  progress: { color: colors.chalk85, fontFamily: fonts.sansBold, fontSize: 10 },
  captainStatus: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 10 },
  ready: { color: colors.turf400 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  save: { flex: 1 },
  clear: { minWidth: 72, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md },
  clearText: { color: colors.chalk85, fontFamily: fonts.sansBold, fontSize: 12 },
  disabled: { opacity: 0.42 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)', padding: spacing.md },
  modal: { ...shadows.floating, maxHeight: '78%', borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: radius.xl, backgroundColor: colors.ink850, padding: spacing.lg },
  modalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  modalCopy: { flex: 1 },
  modalEyebrow: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.6 },
  modalTitle: { marginTop: 2, color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 29 },
  modalHelp: { marginTop: 2, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm },
  closeText: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 24, lineHeight: 26 },
  modalList: { paddingTop: spacing.md, gap: spacing.sm },
  remove: { alignItems: 'center', borderWidth: 1, borderColor: 'rgba(248,113,113,0.28)', borderRadius: radius.sm, padding: 12 },
  removeText: { color: '#FECACA', fontFamily: fonts.sansBold, fontSize: 11 },
  group: { overflow: 'hidden', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.1)' },
  groupHead: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.goldBorder, paddingHorizontal: 11 },
  groupTitle: { color: colors.chalk72, fontFamily: fonts.sansBlack, fontSize: 10, letterSpacing: 1 },
  groupCount: { marginLeft: 'auto', color: colors.chalkMuted, fontFamily: fonts.mono, fontSize: 10 },
  candidate: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.goldBorder, paddingHorizontal: 11, paddingVertical: 9 },
  candidateName: { flex: 1, color: colors.chalk, fontFamily: fonts.sansSemiBold, fontSize: 12 },
  candidateMeta: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 8, letterSpacing: 0.7 },
  candidatePicked: { color: colors.gold },
  noCandidates: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.goldBorder, borderRadius: radius.sm, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 11, padding: spacing.lg, textAlign: 'center' },
});
