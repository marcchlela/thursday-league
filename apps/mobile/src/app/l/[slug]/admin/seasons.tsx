import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack, AdminCardHeader, AdminHero } from '@/components/AdminChrome';
import { LeagueHeader } from '@/components/LeagueChrome';
import { Button, Card, Field, Loading, Message, Pill, Screen } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
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
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

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
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'The season mode could not be changed.')); return; }
    setTone('success'); setMessage(mode === 'yearly' ? 'Yearly season selected.' : 'Custom season selected.'); await load();
  }

  async function createCustom() {
    if (!league) return;
    if (!name.trim()) return setMessage('Enter a season name.');
    if (end.getTime() < start.getTime()) return setMessage('End date must be after the start date.');
    setBusy(true);
    const result = await getSupabaseClient().rpc('create_custom_season', { target_league_id: league.id, season_name: name.trim(), season_start: dateOnly(start), season_end: dateOnly(end), make_current: true });
    setBusy(false);
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'The custom season could not be created.')); return; }
    setName(''); setTone('success'); setMessage('Custom season created and selected.'); await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading season controls..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  const current = seasons.find(item => item.id === settings?.current_season_id);
  return <Screen header={<LeagueHeader league={league} />} compact>
    <AdminBack onPress={() => router.back()} />
    <AdminHero eyebrow="SEASON CONTROL" title="Seasons." text="Yearly mode runs automatically. Use custom dates when the competition has a defined start and finish." icon={{ ios: 'calendar.badge.clock', android: 'date_range' }} />
    {message ? <Message tone={tone}>{message}</Message> : null}
    <Card><AdminCardHeader title="Season format" detail="Choose how matches are grouped in tables and records." icon={{ ios: 'calendar', android: 'calendar_month' }} /><View style={styles.currentBlock}><Text style={styles.dateLabel}>CURRENT SEASON</Text><Text style={styles.current}>{current?.name || 'Not selected'}</Text><Pill tone="gold">{settings?.season_mode || 'yearly'} mode</Pill></View><Button variant="secondary" onPress={() => setMode('yearly')} disabled={busy || settings?.season_mode === 'yearly'}>Use yearly seasons</Button></Card>
    <Card><AdminCardHeader title="Create custom season" detail="Set the competition name and active date range." icon={{ ios: 'calendar.badge.plus', android: 'event_available' }} /><Field label="Season name" value={name} onChangeText={setName} maxLength={60} placeholder="Autumn Cup" /><View style={styles.dateRow}><DateButton label="START" value={dateOnly(start)} onPress={() => setPicker('start')} /><DateButton label="END" value={dateOnly(end)} onPress={() => setPicker('end')} /></View>{picker ? <DateTimePicker value={picker === 'start' ? start : end} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={picker === 'end' ? start : undefined} onChange={changeDate} themeVariant="dark" /> : null}{picker && Platform.OS === 'ios' ? <Button variant="secondary" onPress={() => setPicker(null)}>Done</Button> : null}<Button onPress={createCustom} disabled={busy}>{busy ? 'Saving...' : 'Create and use season'}</Button></Card>
    <Card><AdminCardHeader title="Season history" detail="Past and available competition windows." icon={{ ios: 'clock.arrow.circlepath', android: 'history' }} count={seasons.length} />{loading ? <Text style={styles.detail}>Loading seasons...</Text> : seasons.length ? seasons.map(season => <View key={season.id} style={styles.seasonRow}><View style={styles.seasonCopy}><View style={styles.nameRow}><Text style={styles.seasonName}>{season.name}</Text>{season.id === current?.id ? <Pill tone="green">Current</Pill> : <Pill>{season.format}</Pill>}</View><Text style={styles.detail}>{season.start_date} → {season.end_date}</Text></View>{season.format === 'custom' && season.id !== current?.id ? <Pressable onPress={() => setMode('custom', season.id)} style={styles.useButton}><Text style={styles.useText}>Use</Text></Pressable> : null}</View>) : <Text style={styles.detail}>No seasons have been created yet.</Text>}</Card>
  </Screen>;
}

function DateButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.dateButton}><Text style={styles.dateLabel}>{label}</Text><Text style={styles.dateValue}>{value}</Text></Pressable>; }
function dateOnly(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
const styles = StyleSheet.create({ currentBlock: { gap: 7, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.ink800, padding: spacing.md }, current: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: 29, textTransform: 'uppercase' }, detail: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 15 }, dateRow: { flexDirection: 'row', gap: spacing.sm }, dateButton: { flex: 1, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.ink800, padding: spacing.md }, dateLabel: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.5 }, dateValue: { marginTop: 4, color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, seasonRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder }, seasonCopy: { flex: 1 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, seasonName: { flexShrink: 1, color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, useButton: { borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8 }, useText: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 9 } });
