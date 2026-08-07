import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Field, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import type { Season } from '@/lib/types';

type Picker = 'start' | 'end' | null;
type LeagueSettings = { season_mode: 'yearly' | 'custom'; current_season_id: string | null };

export default function AdminSeasonsScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, membership, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [settings, setSettings] = useState<LeagueSettings | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState(() => new Date());
  const [end, setEnd] = useState(() => { const value = new Date(); value.setMonth(value.getMonth() + 3); return value; });
  const [picker, setPicker] = useState<Picker>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const allowed = membership?.role === 'owner' || membership?.role === 'admin';

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const [seasonResult, settingsResult] = await Promise.all([
      supabase.from('seasons').select('*').eq('league_id', league.id).order('start_date', { ascending: false }),
      supabase.from('league_settings').select('season_mode, current_season_id').eq('league_id', league.id).maybeSingle(),
    ]);
    setLoading(false);
    if (seasonResult.error || settingsResult.error) return setMessage('Season settings could not be loaded.');
    setSeasons((seasonResult.data || []) as Season[]);
    setSettings((settingsResult.data || null) as LeagueSettings | null);
  }, [league]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  function changeDate(event: DateTimePickerEvent, value?: Date) {
    const target = picker;
    if (Platform.OS === 'android') setPicker(null);
    if (event.type !== 'set' || !value || !target) return;
    if (target === 'start') setStart(value); else setEnd(value);
  }

  async function setMode(mode: 'yearly' | 'custom', seasonId?: string) {
    if (!league) return;
    setBusy(true);
    const result = await getSupabaseClient().rpc('set_season_mode', { target_league_id: league.id, new_mode: mode, target_season_id: seasonId || null });
    setBusy(false);
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'The season mode could not be changed.'));
      return;
    }
    setTone('success');
    setMessage(mode === 'yearly' ? 'Yearly season selected.' : 'Custom season selected.');
    await load();
  }

  async function createCustom() {
    if (!league) return;
    if (!name.trim()) return setMessage('Enter a season name.');
    if (end.getTime() < start.getTime()) return setMessage('End date must be after the start date.');
    setBusy(true);
    const result = await getSupabaseClient().rpc('create_custom_season', { target_league_id: league.id, season_name: name.trim(), season_start: dateOnly(start), season_end: dateOnly(end), make_current: true });
    setBusy(false);
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'The custom season could not be created.'));
      return;
    }
    setName('');
    setTone('success');
    setMessage('Custom season created and selected.');
    await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading season controls..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  const current = seasons.find(item => item.id === settings?.current_season_id);
  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.back()}>← League Admin</Button><Eyebrow>SEASON CONTROL</Eyebrow><Title>Seasons.</Title><Body>Yearly mode works automatically. Use custom dates only when your competition has a defined start and finish.</Body>{message ? <Message tone={tone}>{message}</Message> : null}<Card><Text style={styles.cardTitle}>Current season</Text><Text style={styles.current}>{current?.name || 'Not selected'}</Text><Text style={styles.detail}>{settings?.season_mode || 'yearly'} mode</Text><Button onPress={() => setMode('yearly')} disabled={busy || settings?.season_mode === 'yearly'}>Use yearly seasons</Button></Card><Card><Text style={styles.cardTitle}>Create custom season</Text><Field label="Season name" value={name} onChangeText={setName} maxLength={60} placeholder="Autumn Cup" /><View style={styles.dateRow}><Pressable onPress={() => setPicker('start')} style={styles.dateButton}><Text style={styles.dateLabel}>START</Text><Text style={styles.dateValue}>{dateOnly(start)}</Text></Pressable><Pressable onPress={() => setPicker('end')} style={styles.dateButton}><Text style={styles.dateLabel}>END</Text><Text style={styles.dateValue}>{dateOnly(end)}</Text></Pressable></View>{picker ? <DateTimePicker value={picker === 'start' ? start : end} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={picker === 'end' ? start : undefined} onChange={changeDate} themeVariant="dark" /> : null}{picker && Platform.OS === 'ios' ? <Button variant="secondary" onPress={() => setPicker(null)}>Done</Button> : null}<Button onPress={createCustom} disabled={busy}>{busy ? 'Saving...' : 'Create and use custom season'}</Button></Card>{loading ? <Card><Text style={styles.detail}>Loading seasons...</Text></Card> : <Card><Text style={styles.cardTitle}>Season history</Text>{seasons.map(season => <View key={season.id} style={styles.seasonRow}><View style={styles.seasonCopy}><Text style={styles.seasonName}>{season.name}</Text><Text style={styles.detail}>{season.start_date} → {season.end_date} · {season.format}</Text></View>{season.format === 'custom' && season.id !== current?.id ? <Pressable onPress={() => setMode('custom', season.id)} style={styles.useButton}><Text style={styles.useText}>Use</Text></Pressable> : season.id === current?.id ? <Text style={styles.active}>Current</Text> : null}</View>)}</Card>}</Screen>;
}

function dateOnly(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
const styles = StyleSheet.create({ cardTitle: { color: colors.chalk, fontSize: 19, fontWeight: '900' }, current: { color: colors.gold, fontSize: 25, fontWeight: '900' }, detail: { color: colors.chalkMuted, fontSize: 10, lineHeight: 15 }, dateRow: { flexDirection: 'row', gap: spacing.sm }, dateButton: { flex: 1, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, padding: spacing.md }, dateLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, dateValue: { marginTop: 4, color: colors.chalk, fontSize: 13, fontWeight: '800' }, seasonRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, seasonCopy: { flex: 1 }, seasonName: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, useButton: { borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 7 }, useText: { color: colors.gold, fontSize: 10, fontWeight: '900' }, active: { color: colors.turf400, fontSize: 10, fontWeight: '900' } });
