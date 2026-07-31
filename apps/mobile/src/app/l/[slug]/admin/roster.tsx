import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Field, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
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

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true);
    const result = await getSupabaseClient().from('players').select('*').eq('league_id', league.id).order('active', { ascending: false }).order('name');
    setLoading(false);
    if (result.error) return setMessage(friendlyMobileError(result.error, 'The roster could not be loaded.'));
    setPlayers((result.data || []) as Player[]);
  }, [league]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  async function addPlayer() {
    if (!league) return;
    if (name.trim().length < 2) return setMessage('Player name needs at least 2 characters.');
    setBusy(true);
    setMessage(null);
    const result = await getSupabaseClient().from('players').insert({
      league_id: league.id,
      name: name.trim(),
      default_position: position,
      active: true,
      player_type: guest ? 'guest' : 'regular',
      fantasy_eligible: fantasyEligible,
      individual_betting_eligible: bettingEligible,
      competition_eligible: fantasyEligible || bettingEligible,
    });
    setBusy(false);
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'The player could not be added.'));
      return;
    }
    setName('');
    setTone('success');
    setMessage('Player added to this league.');
    await load();
  }

  async function toggleActive(player: Player) {
    setBusy(true);
    const result = await getSupabaseClient().rpc('admin_update_player_settings', {
      target_player_id: player.id,
      new_name: player.name,
      new_position: player.default_position,
      new_active: !player.active,
      new_player_type: player.player_type || 'regular',
      new_fantasy_eligibility: player.fantasy_eligible !== false,
      new_betting_eligibility: player.individual_betting_eligible !== false,
    });
    setBusy(false);
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'The player could not be updated.'));
      return;
    }
    await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading roster controls..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.back()}>← League Admin</Button><Eyebrow>ROSTER CONTROL</Eyebrow><Title>Players.</Title><Body>Add the active group first. Guest and eligibility settings stay explicit.</Body>{message ? <Message tone={tone}>{message}</Message> : null}<Card><Field label="Player name" value={name} onChangeText={setName} maxLength={80} placeholder="Full name" /><Text style={styles.label}>Default position</Text><View style={styles.segment}>{(['outfield', 'goalkeeper'] as const).map(item => <Pressable key={item} onPress={() => setPosition(item)} style={[styles.option, position === item && styles.optionActive]}><Text style={[styles.optionText, position === item && styles.optionTextActive]}>{item === 'goalkeeper' ? 'Goalkeeper' : 'Outfield'}</Text></Pressable>)}</View><Toggle label="Guest player" detail="Guest identity stays separate from model training." value={guest} onPress={() => setGuest(value => !value)} /><Toggle label="Fantasy eligible" detail="Can be picked when included in a lineup." value={fantasyEligible} onPress={() => setFantasyEligible(value => !value)} /><Toggle label="Individual markets" detail="Can receive goal, assist or save markets." value={bettingEligible} onPress={() => setBettingEligible(value => !value)} /><Button onPress={addPlayer} disabled={busy}>{busy ? 'Saving...' : 'Add player'}</Button></Card>{loading ? <Card><Text style={styles.detail}>Loading roster...</Text></Card> : <Card><Text style={styles.rosterTitle}>Current roster · {players.filter(item => item.active).length} active</Text>{players.map(player => <View key={player.id} style={styles.playerRow}><View style={styles.playerCopy}><Text style={[styles.playerName, !player.active && styles.inactive]}>{player.name}</Text><Text style={styles.detail}>{player.default_position === 'goalkeeper' ? 'Goalkeeper' : 'Outfield'} · {player.player_type || 'regular'} · {player.fantasy_eligible === false ? 'Fantasy off' : 'Fantasy on'}</Text></View><Pressable disabled={busy} onPress={() => toggleActive(player)} style={styles.smallAction}><Text style={styles.smallActionText}>{player.active ? 'Archive' : 'Restore'}</Text></Pressable></View>)}</Card>}</Screen>;
}

function Toggle({ label, detail, value, onPress }: { label: string; detail: string; value: boolean; onPress: () => void }) { return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={styles.toggle}><View style={styles.toggleCopy}><Text style={styles.toggleLabel}>{label}</Text><Text style={styles.detail}>{detail}</Text></View><View style={[styles.switch, value && styles.switchOn]}><View style={[styles.knob, value && styles.knobOn]} /></View></Pressable>; }
const styles = StyleSheet.create({ label: { color: colors.chalk, fontSize: 12, fontWeight: '800' }, segment: { flexDirection: 'row', padding: 4, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md }, option: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm }, optionActive: { backgroundColor: colors.gold }, optionText: { color: colors.chalkMuted, fontWeight: '800' }, optionTextActive: { color: colors.ink900 }, toggle: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, toggleCopy: { flex: 1 }, toggleLabel: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, detail: { marginTop: 2, color: colors.chalkMuted, fontSize: 10, lineHeight: 15 }, switch: { width: 50, height: 30, justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: colors.goldMuted, padding: 3 }, switchOn: { backgroundColor: colors.gold }, knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.chalkMuted }, knobOn: { alignSelf: 'flex-end', backgroundColor: colors.ink900 }, rosterTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' }, playerRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, playerCopy: { flex: 1 }, playerName: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, inactive: { color: colors.chalkMuted, textDecorationLine: 'line-through' }, smallAction: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.sm, paddingHorizontal: spacing.sm }, smallActionText: { color: colors.gold, fontSize: 10, fontWeight: '900' } });
