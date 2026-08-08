import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { PlayerStatBoards } from '@/components/PlayerStatBoards';
import { Button, EmptyState, Icon, Loading, Message, Screen } from '@/components/ui';
import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game, GameLineup, GamePlayerStat, MatchEvent, Player, Season } from '@/lib/types';

type ViewMode = 'players' | 'stats';

export default function PlayersScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, membership, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<GamePlayerStat[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [mode, setMode] = useState<ViewMode>('players');
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
      supabase.from('seasons').select('*').eq('league_id', league.id).order('start_date', { ascending: false }),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) return setError(friendlyMobileError(failure, 'Players could not be loaded.'));
    setPlayers((responses[0].data || []) as Player[]); setGames((responses[1].data || []) as Game[]); setLineups((responses[2].data || []) as GameLineup[]); setEvents((responses[3].data || []) as MatchEvent[]); setStats((responses[4].data || []) as GamePlayerStat[]); setSeasons((responses[5].data || []) as Season[]);
  }, [league]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const visible = useMemo(() => players.filter(player => player.name.toLowerCase().includes(query.trim().toLowerCase())), [players, query]);
  if (leagueLoading || switching || !league) return <Loading label="Loading league players..." />;
  const admin = membership?.role === 'owner' || membership?.role === 'admin';

  return (
    <Screen compact>
      <LeagueHeader league={league} /><LeagueNav league={league} />
      <View style={styles.intro}><Text style={styles.eyebrow}>THURSDAY ROSTER</Text><Text style={styles.title}>PLAYERS</Text><Text style={styles.body}>Find a player or explore the league&apos;s seasonal and all-time leaders.</Text></View>
      <View style={styles.tabs}>{(['players', 'stats'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: mode === item }} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}><Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item === 'players' ? 'Players' : 'Stats'}</Text>{mode === item ? <View style={styles.tabLine} /> : null}</Pressable>)}</View>
      {error ? <Message tone="error">{error}</Message> : null}
      {loading ? <LoadingGrid /> : mode === 'players' ? <><View style={styles.search}><Icon name={{ ios: 'magnifyingglass', android: 'search' }} color={colors.goldMuted} size={18} /><TextInput accessibilityLabel="Search players" value={query} onChangeText={setQuery} placeholder="Search players..." placeholderTextColor={colors.chalk45} autoCorrect={false} style={styles.input} /></View>{visible.length ? <View style={styles.grid}>{visible.map(player => <Pressable key={player.id} accessibilityRole="button" accessibilityLabel={`Open ${player.name}`} onPress={() => router.push(`/l/${league.slug}/players/${player.id}`)} style={({ pressed }) => [styles.playerCircle, pressed && styles.pressed]}><Avatar name={player.name} size={43} /><Text numberOfLines={1} style={styles.playerName}>{player.name}</Text><Text style={styles.position}>{player.default_position === 'goalkeeper' ? 'GK' : 'OUT'}</Text>{player.player_type === 'guest' ? <Text style={styles.guest}>GUEST</Text> : null}</Pressable>)}</View> : <EmptyState title={query.trim() ? 'No players found' : 'The roster is empty'} text={query.trim() ? 'Try another player name.' : admin ? 'Add the first players from Admin → Roster.' : 'A league admin has not added the roster yet.'} />}</> : <PlayerStatBoards players={players} games={games} lineups={lineups} events={events} stats={stats} seasons={seasons} onPlayer={id => router.push(`/l/${league.slug}/players/${id}`)} />}
      <Button variant="secondary" onPress={load}>Refresh players</Button>
    </Screen>
  );
}

function LoadingGrid() { return <View style={styles.grid}>{Array.from({ length: 9 }, (_, i) => <View key={i} style={styles.skeleton} />)}</View>; }

const styles = StyleSheet.create({
  intro: { gap: 3, paddingVertical: spacing.sm }, eyebrow: { color: '#B18A37', fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.7 }, title: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 42, lineHeight: 46 }, body: { color: colors.chalk45, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 }, tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 19, backgroundColor: colors.ink850, padding: 4 }, tab: { position: 'relative', flex: 1, minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, tabActive: { backgroundColor: colors.goldSoft }, tabText: { color: colors.chalk45, fontFamily: fonts.sansExtraBold, fontSize: 11 }, tabTextActive: { color: colors.gold }, tabLine: { position: 'absolute', left: 30, right: 30, bottom: 4, height: 2, borderRadius: 1, backgroundColor: colors.gold }, search: { ...shadows.card, minHeight: 53, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 19, backgroundColor: colors.ink850, paddingHorizontal: spacing.md }, input: { flex: 1, height: 51, color: colors.chalk, fontFamily: fonts.sansMedium, fontSize: 13 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2.75%' }, playerCircle: { ...shadows.card, width: '31.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.pill, backgroundColor: colors.ink850, padding: spacing.sm, marginBottom: 9 }, playerName: { width: '100%', marginTop: 6, color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 9, textAlign: 'center' }, position: { marginTop: 2, color: '#B18A37', fontFamily: fonts.sansBlack, fontSize: 6, letterSpacing: 0.8 }, guest: { marginTop: 1, color: colors.chalk30, fontFamily: fonts.sansBlack, fontSize: 5, letterSpacing: 0.7 }, skeleton: { width: '31.5%', aspectRatio: 1, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.pill, backgroundColor: colors.ink850, marginBottom: 9, opacity: 0.5 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
