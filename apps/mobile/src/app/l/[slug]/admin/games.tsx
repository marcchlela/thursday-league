import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { apiRequest, friendlyMobileError } from '@/lib/api';
import { formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type PickerMode = 'date' | 'time' | null;

export default function AdminGamesScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session } = useAuth();
  const { league, membership, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [games, setGames] = useState<Game[]>([]);
  const [kickoff, setKickoff] = useState(defaultKickoff);
  const [picker, setPicker] = useState<PickerMode>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const allowed = membership?.role === 'owner' || membership?.role === 'admin';

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true);
    const result = await getSupabaseClient().from('games').select('*').eq('league_id', league.id).order('game_date', { ascending: false });
    setLoading(false);
    if (result.error) return setMessage(friendlyMobileError(result.error, 'Games could not be loaded.'));
    setGames((result.data || []) as Game[]);
  }, [league]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  function changePicker(event: DateTimePickerEvent, value?: Date) {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'set' && value) setKickoff(value);
  }

  async function schedule() {
    if (!league || !session) return;
    if (kickoff.getTime() <= Date.now()) return setMessage('Choose a kickoff time in the future.');
    setBusy(true);
    setMessage(null);
    const result = await getSupabaseClient().from('games').insert({ league_id: league.id, game_date: kickoff.toISOString(), status: 'upcoming' }).select('*').single();
    if (result.error || !result.data) {
      setBusy(false);
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'The game could not be scheduled.'));
      return;
    }
    let notificationWarning = '';
    try {
      await apiRequest({ path: '/api/push/admin-event', token: session.access_token, body: { gameId: result.data.id, event: 'game_scheduled' } });
    } catch {
      notificationWarning = ' The game is saved; notification delivery will continue separately.';
    }
    setBusy(false);
    setTone('success');
    setMessage(`Game scheduled.${notificationWarning}`);
    setKickoff(defaultKickoff());
    await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading game controls..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.back()}>← League Admin</Button><Eyebrow>MATCH CONTROL</Eyebrow><Title>Games & lineups.</Title><Body>Schedule in your local time. Other members see the same kickoff converted to their device timezone.</Body>{message ? <Message tone={tone}>{message}</Message> : null}<Card><Text style={styles.cardTitle}>Schedule a match</Text><View style={styles.dateSummary}><Text style={styles.dateText}>{formatMatchTime(kickoff.toISOString())}</Text><Text style={styles.hint}>Your device timezone</Text></View><View style={styles.pickerButtons}><View style={styles.pickerButton}><Button variant="secondary" onPress={() => setPicker('date')}>Choose date</Button></View><View style={styles.pickerButton}><Button variant="secondary" onPress={() => setPicker('time')}>Choose time</Button></View></View>{picker ? <DateTimePicker value={kickoff} mode={picker} minimumDate={new Date()} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={changePicker} themeVariant="dark" /> : null}{picker && Platform.OS === 'ios' ? <Button variant="secondary" onPress={() => setPicker(null)}>Done</Button> : null}<Button onPress={schedule} disabled={busy}>{busy ? 'Scheduling...' : 'Schedule game'}</Button></Card>{loading ? <Card><Text style={styles.hint}>Loading games...</Text></Card> : <Card><Text style={styles.cardTitle}>League games</Text>{games.length ? games.map(game => <Pressable key={game.id} accessibilityRole="button" onPress={() => router.push(`/l/${league.slug}/admin/games/${game.id}`)} style={styles.gameRow}><View style={styles.gameCopy}><Text style={styles.gameDate}>{formatMatchTime(game.game_date)}</Text><Text style={styles.hint}>{game.status === 'upcoming' ? 'Lineup not published' : game.status === 'draft' ? 'Lineup ready' : game.status}</Text></View><Text style={styles.open}>Manage →</Text></Pressable>) : <Text style={styles.hint}>No matches yet. Schedule the first one above.</Text>}</Card>}</Screen>;
}

function defaultKickoff() {
  const value = new Date();
  const daysUntilThursday = (4 - value.getDay() + 7) % 7 || 7;
  value.setDate(value.getDate() + daysUntilThursday);
  value.setHours(20, 0, 0, 0);
  return value;
}

const styles = StyleSheet.create({ cardTitle: { color: colors.chalk, fontSize: 19, fontWeight: '900' }, dateSummary: { alignItems: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, padding: spacing.md }, dateText: { color: colors.chalk, fontSize: 16, fontWeight: '900' }, hint: { marginTop: 3, color: colors.chalkMuted, fontSize: 10, lineHeight: 15 }, pickerButtons: { flexDirection: 'row', gap: spacing.sm }, pickerButton: { flex: 1 }, gameRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, gameCopy: { flex: 1 }, gameDate: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, open: { color: colors.gold, fontSize: 11, fontWeight: '900' } });
