import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack, AdminCardHeader, AdminHero } from '@/components/AdminChrome';
import { LeagueHeader } from '@/components/LeagueChrome';
import { Button, Card, Icon, Loading, Message, Pill, Screen } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
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
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function changePicker(event: DateTimePickerEvent, value?: Date) { if (Platform.OS === 'android') setPicker(null); if (event.type === 'set' && value) setKickoff(value); }
  async function schedule() {
    if (!league || !session) return;
    if (kickoff.getTime() <= Date.now()) return setMessage('Choose a kickoff time in the future.');
    setBusy(true); setMessage(null);
    const result = await getSupabaseClient().from('games').insert({ league_id: league.id, game_date: kickoff.toISOString(), status: 'upcoming' }).select('*').single();
    if (result.error || !result.data) { setBusy(false); setTone('error'); setMessage(friendlyMobileError(result.error, 'The game could not be scheduled.')); return; }
    let notificationWarning = '';
    try { await apiRequest({ path: '/api/push/admin-event', token: session.access_token, body: { gameId: result.data.id, event: 'game_scheduled' } }); }
    catch { notificationWarning = ' The match is saved; notification delivery continues separately.'; }
    setBusy(false); setTone('success'); setMessage(`Game scheduled.${notificationWarning}`); setKickoff(defaultKickoff()); await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading game controls..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  return <Screen header={<LeagueHeader league={league} />} compact><AdminBack onPress={() => router.back()} /><AdminHero eyebrow="MATCH CONTROL" title="Games & lineups." text="Schedule in your local time. Every member sees the same kickoff converted to their device timezone." icon={{ ios: 'sportscourt.fill', android: 'sports_soccer' }} />{message ? <Message tone={tone}>{message}</Message> : null}<Card><AdminCardHeader title="Schedule a match" detail="Pick the next local date and kickoff time." icon={{ ios: 'calendar.badge.plus', android: 'event_available' }} /><View style={styles.dateSummary}><View style={styles.dateIcon}><Icon name={{ ios: 'calendar', android: 'calendar_month' }} color={colors.gold} size={21} /></View><View style={styles.dateCopy}><Text style={styles.dateText}>{formatMatchTime(kickoff.toISOString())}</Text><Text style={styles.hint}>YOUR DEVICE TIMEZONE</Text></View></View><View style={styles.pickerButtons}><Pressable onPress={() => setPicker('date')} style={styles.pickerButton}><Icon name={{ ios: 'calendar', android: 'calendar_month' }} color={colors.gold} size={16} /><Text style={styles.pickerText}>Choose date</Text></Pressable><Pressable onPress={() => setPicker('time')} style={styles.pickerButton}><Icon name={{ ios: 'clock.fill', android: 'schedule' }} color={colors.gold} size={16} /><Text style={styles.pickerText}>Choose time</Text></Pressable></View>{picker ? <DateTimePicker value={kickoff} mode={picker} minimumDate={new Date()} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={changePicker} themeVariant="dark" /> : null}{picker && Platform.OS === 'ios' ? <Button variant="secondary" onPress={() => setPicker(null)}>Done</Button> : null}<Button icon={{ ios: 'plus', android: 'add' }} onPress={schedule} disabled={busy}>{busy ? 'Scheduling...' : 'Schedule game'}</Button></Card><Card><AdminCardHeader title="League games" detail="Open a match to set lineups, statistics and its final status." icon={{ ios: 'list.bullet.rectangle.fill', android: 'format_list_bulleted' }} count={games.length} />{loading ? <Text style={styles.hint}>Loading games...</Text> : games.length ? games.map(game => <Pressable key={game.id} accessibilityRole="button" onPress={() => router.push(`/l/${league.slug}/admin/games/${game.id}`)} style={({ pressed }) => [styles.gameRow, pressed && styles.pressed]}><View style={styles.gameStatus}><Icon name={game.status === 'final' ? { ios: 'checkmark.circle.fill', android: 'check_circle' } : game.status === 'live' ? { ios: 'dot.radiowaves.left.and.right', android: 'sensors' } : { ios: 'calendar', android: 'calendar_month' }} color={game.status === 'final' ? colors.turf400 : colors.gold} size={18} /></View><View style={styles.gameCopy}><Text style={styles.gameDate}>{formatMatchTime(game.game_date)}</Text><View style={styles.gameMeta}><Pill tone={game.status === 'final' ? 'green' : game.status === 'live' ? 'red' : 'gold'}>{game.status}</Pill><Text style={styles.hint}>{game.status === 'upcoming' ? 'Lineups not published' : game.status === 'draft' ? 'Lineups ready' : 'Open match control'}</Text></View></View><Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} color={colors.chalk30} size={18} /></Pressable>) : <View style={styles.empty}><Icon name={{ ios: 'calendar.badge.plus', android: 'event_busy' }} color={colors.gold} size={24} /><Text style={styles.emptyTitle}>NO MATCHES YET</Text><Text style={styles.hint}>Schedule the first game above.</Text></View>}</Card></Screen>;
}

function defaultKickoff() { const value = new Date(); const daysUntilThursday = (4 - value.getDay() + 7) % 7 || 7; value.setDate(value.getDate() + daysUntilThursday); value.setHours(20, 0, 0, 0); return value; }
const styles = StyleSheet.create({ dateSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.ink800, padding: spacing.md }, dateIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.goldSoft }, dateCopy: { flex: 1 }, dateText: { color: colors.chalk, fontFamily: fonts.sansExtraBold, fontSize: 14 }, hint: { marginTop: 3, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 15 }, pickerButtons: { flexDirection: 'row', gap: spacing.sm }, pickerButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.goldSoft }, pickerText: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 11 }, gameRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder, paddingVertical: spacing.sm }, pressed: { opacity: 0.65 }, gameStatus: { width: 41, height: 41, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.ink800 }, gameCopy: { flex: 1 }, gameDate: { color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, gameMeta: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, empty: { alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.goldBorder, borderRadius: radius.md, padding: spacing.xl }, emptyTitle: { marginTop: spacing.sm, color: colors.chalk, fontFamily: fonts.display, fontSize: 21 } });
