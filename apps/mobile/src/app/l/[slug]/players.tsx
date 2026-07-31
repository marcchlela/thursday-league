import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Field, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { careerStats } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game, GameLineup, GamePlayerStat, MatchEvent, Player } from '@/lib/types';

type ViewMode = 'roster' | 'stats';

export default function PlayersScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<GamePlayerStat[]>([]);
  const [mode, setMode] = useState<ViewMode>('roster');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('players').select('*').eq('league_id', league.id).eq('active', true).is('archived_at', null).order('name'),
      supabase.from('games').select('*').eq('league_id', league.id),
      supabase.from('game_lineups').select('*').eq('league_id', league.id),
      supabase.from('events').select('*').eq('league_id', league.id),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) return setError(friendlyMobileError(failure, 'Players could not be loaded.'));
    setPlayers((responses[0].data || []) as Player[]);
    setGames((responses[1].data || []) as Game[]);
    setLineups((responses[2].data || []) as GameLineup[]);
    setEvents((responses[3].data || []) as MatchEvent[]);
    setStats((responses[4].data || []) as GamePlayerStat[]);
  }, [league]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  const visible = useMemo(() => players.filter(player => player.name.toLowerCase().includes(query.trim().toLowerCase())), [players, query]);
  const leaders = useMemo(() => players.map(player => ({ player, stats: careerStats({ player, games, lineups, events, stats }) })).sort((first, second) => second.stats.goals - first.stats.goals || second.stats.assists - first.stats.assists || first.player.name.localeCompare(second.player.name)), [events, games, lineups, players, stats]);
  if (leagueLoading || switching || !league) return <Loading label="Loading league players..." />;

  return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><Eyebrow>LEAGUE ROSTER</Eyebrow><Title>Players.</Title><Body>Browse the active roster and every recorded performance.</Body><View style={styles.tabs}>{(['roster', 'stats'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: mode === item }} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}><Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item === 'roster' ? 'Roster' : 'Stats'}</Text></Pressable>)}</View>{error ? <Message tone="error">{error}</Message> : null}{loading ? <Card><Text style={styles.muted}>Loading players...</Text></Card> : mode === 'roster' ? <><Field label="Search players" value={query} onChangeText={setQuery} placeholder="Player name" autoCorrect={false} />{visible.length ? <View style={styles.grid}>{visible.map(player => <Pressable key={player.id} accessibilityRole="button" onPress={() => router.push(`/l/${league.slug}/players/${player.id}`)} style={styles.playerCard}><Avatar name={player.name} size={56} /><Text numberOfLines={1} style={styles.playerName}>{player.name}</Text><Text style={styles.position}>{player.default_position === 'goalkeeper' ? 'GK' : 'OUT'}{player.player_type === 'guest' ? ' · GUEST' : ''}</Text></Pressable>)}</View> : <Card><Text style={styles.emptyTitle}>No players found</Text><Text style={styles.muted}>Try another name, or ask a league admin to add the roster.</Text></Card>}</> : <Card><Text style={styles.boardTitle}>All-time leaders</Text>{leaders.length ? leaders.map((row, index) => <Pressable key={row.player.id} onPress={() => router.push(`/l/${league.slug}/players/${row.player.id}`)} style={styles.statRow}><Text style={styles.rank}>#{index + 1}</Text><Avatar name={row.player.name} size={36} /><View style={styles.statCopy}><Text style={styles.statName}>{row.player.name}</Text><Text style={styles.muted}>{row.stats.appearances} apps · {row.stats.assists} assists</Text></View><Text style={styles.goals}>{row.stats.goals} G</Text></Pressable>) : <Text style={styles.muted}>Statistics appear after completed games.</Text>}</Card>}<Button variant="secondary" onPress={load}>Refresh players</Button></Screen>;
}

const styles = StyleSheet.create({ tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, backgroundColor: colors.ink850, padding: 4 }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm }, tabActive: { backgroundColor: colors.ink800 }, tabText: { color: colors.chalkMuted, fontWeight: '800' }, tabTextActive: { color: colors.gold }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, playerCard: { width: '31.5%', minHeight: 130, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.sm }, playerName: { width: '100%', marginTop: spacing.sm, color: colors.chalk, fontSize: 11, fontWeight: '900', textAlign: 'center' }, position: { marginTop: 3, color: colors.gold, fontSize: 8, fontWeight: '900' }, muted: { color: colors.chalkMuted, fontSize: 11, lineHeight: 16 }, emptyTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' }, boardTitle: { color: colors.chalk, fontSize: 20, fontWeight: '900' }, statRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, rank: { width: 28, color: colors.gold, fontSize: 11, fontWeight: '900' }, statCopy: { flex: 1 }, statName: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, goals: { color: colors.gold, fontSize: 15, fontWeight: '900' } });
