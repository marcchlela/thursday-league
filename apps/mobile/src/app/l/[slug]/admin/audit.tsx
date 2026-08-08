import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack, AdminCardHeader, AdminHero } from '@/components/AdminChrome';
import { LeagueHeader } from '@/components/LeagueChrome';
import { Button, Card, Icon, Loading, Message, Pill, Screen } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { AdminAuditLog, Game } from '@/lib/types';

const labels: Record<string, string> = { lineup_replaced: 'Lineup saved', status_changed: 'Game status changed', final_game_reopened: 'Final game reopened', player_archived: 'Player archived', player_restored: 'Player restored', players_insert: 'Player created', players_update: 'Player updated', games_insert: 'Game created', games_update: 'Game updated', games_delete: 'Game deleted', events_insert: 'Event added', events_update: 'Event updated', events_delete: 'Event deleted', game_player_stats_insert: 'Player stat added', game_player_stats_update: 'Player stat updated', game_player_stats_delete: 'Player stat removed', season_created: 'Season created', season_mode_changed: 'Season mode changed', season_updated: 'Season updated', league_created: 'League created', league_member_role_changed: 'Member role changed', league_ownership_transferred: 'League ownership transferred', league_member_removed: 'League member removed', league_options_updated: 'League options updated', league_join_code_rotated: 'League code rotated', league_archived: 'League archived' };

export default function AdminAuditScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, membership, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [rows, setRows] = useState<AdminAuditLog[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allowed = membership?.role === 'owner' || membership?.role === 'admin';

  const load = useCallback(async () => {
    if (!league || !allowed) return;
    setLoading(true); setError(null);
    const [audit, gameResult] = await Promise.all([getSupabaseClient().from('admin_audit_log').select('*').eq('league_id', league.id).order('created_at', { ascending: false }).limit(200), getSupabaseClient().from('games').select('*').eq('league_id', league.id)]);
    setLoading(false);
    if (audit.error || gameResult.error) { setError(friendlyMobileError(audit.error || gameResult.error, 'Audit history could not be loaded.')); return; }
    setRows((audit.data || []) as AdminAuditLog[]); setGames((gameResult.data || []) as Game[]);
  }, [allowed, league]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return needle ? rows.filter(row => `${actionLabel(row.action)} ${row.reason || ''}`.toLowerCase().includes(needle)) : rows; }, [query, rows]);

  if (leagueLoading || switching || !league) return <Loading label="Loading audit history..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  return <Screen header={<LeagueHeader league={league} />} compact><AdminBack onPress={() => router.back()} /><AdminHero eyebrow="ACCOUNTABILITY" title="Audit history." text="The latest 200 controlled league and match-management changes, newest first." icon={{ ios: 'clock.arrow.circlepath', android: 'history' }} />{error ? <Message tone="error">{error}</Message> : null}<Card><AdminCardHeader title="Find a change" detail="Search by action or correction reason." icon={{ ios: 'magnifyingglass', android: 'search' }} count={rows.length} /><View style={styles.search}><Icon name={{ ios: 'magnifyingglass', android: 'search' }} color={colors.goldMuted} size={17} /><TextInput value={query} onChangeText={setQuery} placeholder="Search audit history" placeholderTextColor={colors.chalk45} style={styles.input} /></View><Button variant="secondary" onPress={load}>Refresh history</Button></Card>{loading ? <Loading label="Loading audit history..." /> : filtered.length ? filtered.map(row => { const open = expanded === row.id; const game = games.find(item => item.id === row.game_id); return <Card key={row.id} style={styles.entry}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : row.id)} style={styles.entryHead}><View style={styles.entryIcon}><Icon name={{ ios: 'pencil.and.list.clipboard', android: 'edit_note' }} color={colors.gold} size={19} /></View><View style={styles.entryCopy}><Text style={styles.entryTitle}>{actionLabel(row.action)}</Text><Text style={styles.entryMeta}>{formatMatchTime(row.created_at)}{row.reason ? ` · ${row.reason}` : ''}</Text></View>{game ? <Pill>{fixtureDate(game.game_date)}</Pill> : null}<Icon name={{ ios: open ? 'chevron.up' : 'chevron.down', android: open ? 'keyboard_arrow_up' : 'keyboard_arrow_down' }} color={colors.chalkMuted} size={17} /></Pressable>{open ? <View style={styles.details}><Snapshot label="Before" value={row.before_data} /><Snapshot label="After" value={row.after_data} /></View> : null}</Card>; }) : <Card style={styles.empty}><Icon name={{ ios: 'clock.arrow.circlepath', android: 'history' }} color={colors.gold} size={24} /><Text style={styles.emptyTitle}>NO AUDIT ENTRIES</Text><Text style={styles.entryMeta}>{rows.length ? 'No entries match this search.' : 'League setup, membership and match changes will appear here.'}</Text></Card>}</Screen>;
}

function Snapshot({ label, value }: { label: string; value: AdminAuditLog['before_data'] }) { if (!value || Array.isArray(value)) return null; const entries = Object.entries(value).filter(([key]) => !['id', 'league_id', 'created_at', 'updated_at'].includes(key)).slice(0, 12); if (!entries.length) return null; return <View style={styles.snapshot}><Text style={styles.snapshotLabel}>{label}</Text>{entries.map(([key, entry]) => <View key={key} style={styles.field}><Text style={styles.fieldName}>{key.replaceAll('_', ' ')}</Text><Text numberOfLines={3} style={styles.fieldValue}>{readable(entry)}</Text></View>)}</View>; }
function readable(value: unknown) { if (value === null || value === undefined || value === '') return 'None'; if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled'; if (Array.isArray(value)) return `${value.length} items`; if (typeof value === 'object') return 'Detailed data updated'; return String(value).replaceAll('_', ' '); }
function actionLabel(value: string) { return labels[value] || value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
function fixtureDate(value: string) { const date = new Date(value); return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`; }
const styles = StyleSheet.create({ search: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.ink800, paddingHorizontal: spacing.md }, input: { flex: 1, color: colors.chalk, fontFamily: fonts.sansMedium, fontSize: 12 }, entry: { padding: 0, overflow: 'hidden', gap: 0 }, entryHead: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md }, entryIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.goldSoft }, entryCopy: { flex: 1 }, entryTitle: { color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, entryMeta: { marginTop: 3, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 }, details: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder, padding: spacing.md }, snapshot: { borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.ink800, padding: spacing.md }, snapshotLabel: { marginBottom: 4, color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.3, textTransform: 'uppercase' }, field: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.goldBorder, paddingVertical: 7 }, fieldName: { width: 105, color: colors.chalk45, fontFamily: fonts.sansBold, fontSize: 8, textTransform: 'capitalize' }, fieldValue: { flex: 1, color: colors.chalk72, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 }, empty: { alignItems: 'center', paddingVertical: spacing.xl }, emptyTitle: { marginTop: spacing.sm, color: colors.chalk, fontFamily: fonts.display, fontSize: 22 } });
