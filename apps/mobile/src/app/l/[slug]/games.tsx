import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { calculateScore, formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game, GameLineup, GamePlayerStat, MatchEvent } from '@/lib/types';

type ViewMode = 'upcoming' | 'results';

export default function GamesScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, loading: leagueLoading, switching, error: leagueError } = useScopedLeague(slug);
  const [mode, setMode] = useState<ViewMode>('upcoming');
  const [games, setGames] = useState<Game[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<GamePlayerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('games').select('*').eq('league_id', league.id).order('game_date', { ascending: false }),
      supabase.from('game_lineups').select('*').eq('league_id', league.id),
      supabase.from('events').select('*').eq('league_id', league.id),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id),
    ]);
    const failure = responses.find(item => item.error)?.error;
    setLoading(false);
    if (failure) {
      setError(friendlyMobileError(failure, 'Games could not be loaded.'));
      return;
    }
    setGames((responses[0].data || []) as Game[]);
    setLineups((responses[1].data || []) as GameLineup[]);
    setEvents((responses[2].data || []) as MatchEvent[]);
    setStats((responses[3].data || []) as GamePlayerStat[]);
  }, [league]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  useEffect(() => {
    if (!league) return;
    const supabase = getSupabaseClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void load(), 180);
    };
    const channel = supabase.channel(`mobile-games-${league.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `league_id=eq.${league.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `league_id=eq.${league.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_stats', filter: `league_id=eq.${league.id}` }, refresh)
      .subscribe();
    return () => { if (refreshTimer) clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
  }, [league, load]);

  const visible = useMemo(() => games.filter(game => mode === 'results' ? game.status === 'final' : game.status !== 'final').sort((first, second) => mode === 'results' ? new Date(second.game_date).getTime() - new Date(first.game_date).getTime() : (first.status === 'live' ? -1 : second.status === 'live' ? 1 : new Date(first.game_date).getTime() - new Date(second.game_date).getTime())), [games, mode]);
  if (leagueLoading || switching || !league) return <Loading label="Loading league games..." />;

  return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><Eyebrow>FIXTURES & RESULTS</Eyebrow><Title>Games.</Title><Body>Upcoming lineups, live scores and the full match history for {league.name}.</Body><View style={styles.tabs}>{(['upcoming', 'results'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: mode === item }} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}><Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item === 'upcoming' ? 'Upcoming' : 'Results'}</Text></Pressable>)}</View>{leagueError || error ? <Message tone="error">{leagueError || error}</Message> : null}{loading ? <LoadingCard /> : visible.length ? visible.map(game => { const gameLineups = lineups.filter(item => item.game_id === game.id); const score = calculateScore(events.filter(item => item.game_id === game.id), gameLineups, stats.filter(item => item.game_id === game.id)); const showScore = game.status === 'live' || game.status === 'final'; return <Pressable key={game.id} accessibilityRole="button" onPress={() => router.push(`/l/${league.slug}/games/${game.id}`)} style={styles.gameCard}><View style={styles.gameMeta}><Text style={styles.date}>{formatMatchTime(game.game_date)}</Text><Text style={[styles.status, game.status === 'live' && styles.live]}>{game.status}</Text></View><View style={styles.scoreRow}><Team label="Team A" /><Text style={styles.score}>{showScore ? `${score.A} - ${score.B}` : 'VS'}</Text><Team label="Team B" reverse /></View><Text style={styles.open}>Open match →</Text></Pressable>; }) : <Card><Text style={styles.emptyTitle}>{mode === 'upcoming' ? 'No upcoming match' : 'No results yet'}</Text><Text style={styles.emptyText}>{mode === 'upcoming' ? 'A league admin has not scheduled the next game yet.' : 'Completed games will appear here.'}</Text></Card>}<Button variant="secondary" onPress={load}>Refresh games</Button></Screen>;
}

function Team({ label, reverse }: { label: string; reverse?: boolean }) { return <View style={[styles.team, reverse && styles.teamReverse]}><View style={styles.crest}><Text style={styles.crestText}>{label.slice(-1)}</Text></View><Text style={styles.teamLabel}>{label}</Text></View>; }
function LoadingCard() { return <Card><Text style={styles.emptyText}>Loading fixtures...</Text></Card>; }

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, backgroundColor: colors.ink850, padding: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.ink800 },
  tabText: { color: colors.chalkMuted, fontWeight: '800' },
  tabTextActive: { color: colors.turf400 },
  gameCard: { marginBottom: spacing.md, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.md },
  gameMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  date: { color: colors.chalkMuted, fontSize: 11 },
  status: { color: colors.gold, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  live: { color: colors.turf400 },
  scoreRow: { minHeight: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  team: { flex: 1, alignItems: 'flex-start', gap: 5 },
  teamReverse: { alignItems: 'flex-end' },
  crest: { width: 38, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.sm, backgroundColor: colors.ink800 },
  crestText: { color: colors.gold, fontWeight: '900' },
  teamLabel: { color: colors.chalk, fontSize: 12, fontWeight: '800' },
  score: { color: colors.chalk, fontSize: 25, fontWeight: '900' },
  open: { color: colors.gold, fontSize: 11, fontWeight: '900', textAlign: 'right' },
  emptyTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.chalkMuted, fontSize: 13, lineHeight: 19 },
});
