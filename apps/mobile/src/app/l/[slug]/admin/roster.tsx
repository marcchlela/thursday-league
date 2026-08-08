import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack, AdminCardHeader, AdminHero } from '@/components/AdminChrome';
import { Avatar } from '@/components/Avatar';
import { LeagueHeader } from '@/components/LeagueChrome';
import { Button, Card, Field, Loading, Message, Pill, Screen } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import type { Player, PlayerPosition } from '@/lib/types';

export default function AdminRosterScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, membership, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [position, setPosition] = useState<PlayerPosition>('outfield');
  const [guest, setGuest] = useState(false);
  const [fantasyEligible, setFantasyEligible] = useState(true);
  const [bettingEligible, setBettingEligible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const allowed = membership?.role === 'owner' || membership?.role === 'admin';

  const load = useCallback(async () => { if (!league) return; setLoading(true); const result = await getSupabaseClient().from('players').select('*').eq('league_id', league.id).order('active', { ascending: false }).order('name'); setLoading(false); if (result.error) return setMessage(friendlyMobileError(result.error, 'The roster could not be loaded.')); setPlayers((result.data || []) as Player[]); }, [league]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function addPlayer() {
    if (!league) return;
    if (name.trim().length < 2) return setMessage('Player name needs at least 2 characters.');
    setBusy(true); setMessage(null);
    const result = await getSupabaseClient().from('players').insert({ league_id: league.id, name: name.trim(), default_position: position, active: true, player_type: guest ? 'guest' : 'regular', fantasy_eligible: fantasyEligible, individual_betting_eligible: bettingEligible, competition_eligible: fantasyEligible || bettingEligible });
    setBusy(false);
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'The player could not be added.')); return; }
    setName(''); setTone('success'); setMessage('Player added to this league.'); await load();
  }

  async function toggleActive(player: Player) {
    setBusy(true);
    const result = await getSupabaseClient().rpc('admin_update_player_settings', { target_player_id: player.id, new_name: player.name, new_position: player.default_position, new_active: !player.active, new_player_type: player.player_type || 'regular', new_fantasy_eligibility: player.fantasy_eligible !== false, new_betting_eligibility: player.individual_betting_eligible !== false });
    setBusy(false);
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'The player could not be updated.')); return; }
    setTone('success'); setMessage(player.active ? `${player.name} archived.` : `${player.name} restored.`); await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading roster controls..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  const activeCount = players.filter(item => item.active).length;
  return <Screen header={<LeagueHeader league={league} />} compact><AdminBack onPress={() => router.back()} /><AdminHero eyebrow="ROSTER CONTROL" title="Players." text="Build the active match group. Guest status and competition eligibility stay explicit." icon={{ ios: 'person.3.fill', android: 'groups' }} />{message ? <Message tone={tone}>{message}</Message> : null}<Card><AdminCardHeader title="Add player" detail="Create a separate football identity in this league." icon={{ ios: 'person.badge.plus', android: 'person_add' }} /><Field label="Player name" value={name} onChangeText={setName} maxLength={80} placeholder="Full name" /><Text style={styles.label}>Default position</Text><View style={styles.segment}>{(['outfield', 'goalkeeper'] as const).map(item => <Pressable key={item} onPress={() => setPosition(item)} style={[styles.option, position === item && styles.optionActive]}><Text style={[styles.optionText, position === item && styles.optionTextActive]}>{item === 'goalkeeper' ? 'Goalkeeper' : 'Outfield'}</Text></Pressable>)}</View><Toggle label="Guest player" detail="Kept separate from model training unless later made eligible." value={guest} onPress={() => setGuest(value => !value)} /><Toggle label="Fantasy eligible" detail="Can be picked when included in a confirmed lineup." value={fantasyEligible} onPress={() => setFantasyEligible(value => !value)} /><Toggle label="Individual markets" detail="Can receive goal, assist, or save prediction markets." value={bettingEligible} onPress={() => setBettingEligible(value => !value)} /><Button icon={{ ios: 'plus', android: 'add' }} onPress={addPlayer} disabled={busy}>{busy ? 'Saving...' : 'Add player'}</Button></Card><Card><AdminCardHeader title="Current roster" detail="Archived players keep their historical match records." icon={{ ios: 'person.2.fill', android: 'group' }} count={`${activeCount} active`} />{loading ? <Text style={styles.detail}>Loading roster...</Text> : players.length ? players.map(player => <View key={player.id} style={styles.playerRow}><Avatar name={player.name} size={42} /><View style={styles.playerCopy}><View style={styles.playerTop}><Text numberOfLines={1} style={[styles.playerName, !player.active && styles.inactive]}>{player.name}</Text>{player.player_type === 'guest' ? <Pill tone="gold">Guest</Pill> : null}</View><Text style={styles.detail}>{player.default_position === 'goalkeeper' ? 'Goalkeeper' : 'Outfield'} · {player.fantasy_eligible === false ? 'Fantasy off' : 'Fantasy on'} · {player.individual_betting_eligible === false ? 'Markets off' : 'Markets on'}</Text></View><Pressable disabled={busy} onPress={() => toggleActive(player)} style={styles.smallAction}><Text style={[styles.smallActionText, player.active && styles.archiveText]}>{player.active ? 'Archive' : 'Restore'}</Text></Pressable></View>) : <Text style={styles.detail}>No players yet. Add the first player above.</Text>}</Card></Screen>;
}

function Toggle({ label, detail, value, onPress }: { label: string; detail: string; value: boolean; onPress: () => void }) { return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={styles.toggle}><View style={styles.toggleCopy}><Text style={styles.toggleLabel}>{label}</Text><Text style={styles.detail}>{detail}</Text></View><View style={[styles.switch, value && styles.switchOn]}><View style={[styles.knob, value && styles.knobOn]} /></View></Pressable>; }
const styles = StyleSheet.create({ label: { color: colors.chalk72, fontFamily: fonts.sansBold, fontSize: 11 }, segment: { flexDirection: 'row', padding: 4, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.ink800 }, option: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm }, optionActive: { backgroundColor: colors.goldSoft }, optionText: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 11 }, optionTextActive: { color: colors.gold, fontFamily: fonts.sansExtraBold }, toggle: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.goldBorder }, toggleCopy: { flex: 1 }, toggleLabel: { color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, detail: { marginTop: 2, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 15 }, switch: { width: 50, height: 30, justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: colors.goldBorder, padding: 3 }, switchOn: { backgroundColor: colors.gold }, knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.chalkMuted }, knobOn: { alignSelf: 'flex-end', backgroundColor: colors.ink900 }, playerRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder }, playerCopy: { flex: 1 }, playerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 }, playerName: { flexShrink: 1, color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, inactive: { color: colors.chalkMuted, textDecorationLine: 'line-through' }, smallAction: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, paddingHorizontal: spacing.sm }, smallActionText: { color: colors.turf400, fontFamily: fonts.sansBlack, fontSize: 9 }, archiveText: { color: colors.danger } });
