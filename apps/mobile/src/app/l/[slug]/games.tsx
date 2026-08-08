import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { fixtureDate, GameScheduleNavigator, isAwaitingUpdate } from '@/components/GameScheduleNavigator';
import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { TeamCrest } from '@/components/TeamCrest';
import { Button, Card, EmptyState, Loading, Message, Screen } from '@/components/ui';
import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { calculateScore } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game, GameLineup, GamePlayerStat, MatchEvent, TeamCode } from '@/lib/types';

type ViewMode = 'upcoming' | 'all';

export default function GamesScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, membership, loading: leagueLoading, switching, error: leagueError } = useScopedLeague(slug);
  const [mode, setMode] = useState<ViewMode>('upcoming');
  const [games, setGames] = useState<Game[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<GamePlayerStat[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true); setError(null);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('games').select('*').eq('league_id', league.id).order('game_date'),
      supabase.from('game_lineups').select('*').eq('league_id', league.id),
      supabase.from('events').select('*').eq('league_id', league.id),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) return setError(friendlyMobileError(failure, 'Games could not be loaded.'));
    setGames((responses[0].data || []) as Game[]); setLineups((responses[1].data || []) as GameLineup[]); setEvents((responses[2].data || []) as MatchEvent[]); setStats((responses[3].data || []) as GamePlayerStat[]);
  }, [league]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!league) return;
    const supabase = getSupabaseClient(); let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void load(), 180); };
    const channel = supabase.channel(`mobile-games-${league.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `league_id=eq.${league.id}` }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `league_id=eq.${league.id}` }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_stats', filter: `league_id=eq.${league.id}` }, refresh).subscribe();
    return () => { if (refreshTimer) clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
  }, [league, load]);

  const schedule = useMemo(() => ({
    active: games.filter(game => game.status !== 'final' && !isAwaitingUpdate(game, now)).sort((a, b) => a.status === 'live' ? -1 : b.status === 'live' ? 1 : new Date(a.game_date).getTime() - new Date(b.game_date).getTime()),
    awaiting: games.filter(game => isAwaitingUpdate(game, now)).sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()),
    results: games.filter(game => game.status === 'final').sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()),
  }), [games, now]);
  const selected = schedule.active.find(game => game.id === selectedId) || schedule.active[0] || null;
  const admin = membership?.role === 'owner' || membership?.role === 'admin';
  const open = (id: string) => router.push(`/l/${league?.slug}/games/${id}`);

  if (leagueLoading || switching || !league) return <Loading label="Loading league games..." />;
  return (
    <Screen compact>
      <LeagueHeader league={league} /><LeagueNav league={league} />
      <View style={styles.tabs}>{(['upcoming', 'all'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: mode === item }} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}><Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item === 'upcoming' ? 'Upcoming' : 'All games'}</Text>{mode === item ? <View style={styles.tabLine} /> : null}</Pressable>)}</View>
      {leagueError || error ? <Message tone="error">{leagueError || error}</Message> : null}
      {loading ? <Card><Text style={styles.muted}>Loading fixtures...</Text></Card> : null}
      {!loading && mode === 'upcoming' ? selected ? <><GameScheduleNavigator games={games} activeGames={schedule.active} selectedGame={selected} now={now} onSelect={setSelectedId} onOpenGame={open} /><SelectedFixture game={selected} lineups={lineups} events={events} stats={stats} onOpen={() => open(selected.id)} /></> : <><EmptyState title="No upcoming match" text={admin ? 'Schedule the next match from Admin → Games. It will appear here immediately.' : 'A league admin has not scheduled the next match yet.'} />{games.length ? <Button variant="secondary" onPress={() => setMode('all')}>View all games</Button> : null}{schedule.awaiting.length ? <Message>{schedule.awaiting.length} earlier game{schedule.awaiting.length === 1 ? ' is' : 's are'} waiting for an admin update.</Message> : null}</> : null}
      {!loading && mode === 'all' ? !games.length ? <EmptyState title="No games yet" text={admin ? 'Schedule the first match from League Admin.' : 'A league admin has not scheduled a match yet.'} /> : <><GameGroup title="Upcoming" games={schedule.active} lineups={lineups} events={events} stats={stats} now={now} onOpen={open} /><GameGroup title="Awaiting update" description="These dates passed without a final result. Only an admin can mark whether the match was played, postponed, or cancelled." games={schedule.awaiting} lineups={lineups} events={events} stats={stats} now={now} onOpen={open} waiting /><GameGroup title="Results" games={schedule.results} lineups={lineups} events={events} stats={stats} now={now} onOpen={open} /></> : null}
      <Button variant="secondary" onPress={load}>Refresh games</Button>
    </Screen>
  );
}

function SelectedFixture({ game, lineups, events, stats, onOpen }: { game: Game; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[]; onOpen: () => void }) {
  const gameLineups = lineups.filter(row => row.game_id === game.id); const score = calculateScore(events.filter(row => row.game_id === game.id), gameLineups, stats.filter(row => row.game_id === game.id)); const showScore = game.status === 'live' || game.status === 'final';
  return <Pressable onPress={onOpen} style={styles.selected}><View style={styles.selectedTop}><Text style={[styles.kicker, game.status === 'live' && styles.live]}>{game.status === 'live' ? 'LIVE MATCH' : 'NEXT MATCH'}</Text><Text style={styles.open}>OPEN MATCH ↗</Text></View><View style={styles.selectedTeams}><ResultTeam gameId={game.id} team="A" /><View style={styles.selectedScore}><Text style={styles.bigScore}>{showScore ? `${score.A} – ${score.B}` : 'VS'}</Text><View style={styles.scoreLine} /></View><ResultTeam gameId={game.id} team="B" reverse /></View><Text style={styles.selectedTime}>{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(game.game_date))}</Text><Text style={[styles.readiness, gameLineups.length >= 10 && styles.readinessReady]}>{gameLineups.length >= 10 ? '✓  Lineups ready' : '○  Lineups not ready yet'}</Text></Pressable>;
}

function GameGroup({ title, description, games, lineups, events, stats, now, onOpen, waiting }: { title: string; description?: string; games: Game[]; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[]; now: number; onOpen: (id: string) => void; waiting?: boolean }) { if (!games.length) return null; return <View style={styles.group}><View style={styles.groupHead}><View style={styles.groupCopy}><Text style={styles.groupTitle}>{title}</Text>{description ? <Text style={styles.description}>{description}</Text> : null}</View><Text style={styles.groupCount}>{games.length}</Text></View>{games.map(game => <GameListCard key={game.id} game={game} lineups={lineups} events={events} stats={stats} now={now} onOpen={() => onOpen(game.id)} waiting={waiting} />)}</View>; }

function GameListCard({ game, lineups, events, stats, now, onOpen, waiting }: { game: Game; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[]; now: number; onOpen: () => void; waiting?: boolean }) { const rows = lineups.filter(item => item.game_id === game.id); const score = calculateScore(events.filter(item => item.game_id === game.id), rows, stats.filter(item => item.game_id === game.id)); const showScore = game.status === 'final' || game.status === 'live'; const awaiting = isAwaitingUpdate(game, now); const label = game.status === 'final' ? 'FINAL' : game.status === 'live' ? 'LIVE' : awaiting ? rows.length >= 10 ? 'AWAITING RESULT' : 'SETUP INCOMPLETE' : rows.length >= 10 ? 'LINEUPS READY' : 'LINEUPS PENDING'; return <Pressable onPress={onOpen} style={[styles.gameCard, waiting && styles.gameCardWaiting]}><Text style={styles.cardDate}>{fixtureDate(game.game_date, new Date(now).getFullYear())}</Text><Text style={[styles.cardStatus, game.status === 'live' ? styles.livePill : awaiting ? styles.waitingPill : game.status === 'final' ? styles.finalPill : null]}>{label}</Text><View style={styles.cardMain}><ResultTeam gameId={game.id} team="A" /><Text style={styles.cardScore}>{showScore ? `${score.A} – ${score.B}` : fixtureTime(game.game_date)}</Text><ResultTeam gameId={game.id} team="B" reverse /></View></Pressable>; }

function ResultTeam({ gameId, team, reverse }: { gameId: string; team: TeamCode; reverse?: boolean }) { return <View style={[styles.team, reverse && styles.teamReverse]}><TeamCrest gameId={gameId} team={team} size={48} /><Text style={styles.teamName}>Team {team}</Text></View>; }
function fixtureTime(value: string) { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)); }

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 19, backgroundColor: colors.ink850, padding: 4 }, tab: { position: 'relative', flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, tabActive: { backgroundColor: colors.successSoft }, tabText: { color: colors.chalk45, fontFamily: fonts.sansExtraBold, fontSize: 12 }, tabTextActive: { color: colors.turf400 }, tabLine: { position: 'absolute', left: 30, right: 30, bottom: 4, height: 2, borderRadius: 1, backgroundColor: colors.turf400 }, muted: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 11 },
  selected: { ...shadows.card, minHeight: 250, overflow: 'hidden', borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: 26, backgroundColor: colors.ink850, padding: spacing.md }, selectedTop: { flexDirection: 'row', justifyContent: 'space-between' }, kicker: { color: colors.turf400, fontFamily: fonts.sansBlack, fontSize: 9, letterSpacing: 1.6 }, live: { color: colors.danger }, open: { color: colors.chalk45, fontFamily: fonts.sansBlack, fontSize: 8 }, selectedTeams: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }, selectedScore: { alignItems: 'center' }, bigScore: { color: colors.chalk45, fontFamily: fonts.displayBold, fontSize: 29 }, scoreLine: { width: 27, marginTop: 3, borderTopWidth: 1, borderTopColor: colors.gold }, selectedTime: { marginTop: 12, color: colors.chalk72, fontFamily: fonts.sansMedium, fontSize: 11, textAlign: 'center' }, readiness: { alignSelf: 'center', marginTop: 10, color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 9, borderWidth: 1, borderColor: 'rgba(245,242,232,0.09)', borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 11, paddingVertical: 7 }, readinessReady: { color: colors.turf100, borderColor: 'rgba(49,185,78,0.2)', backgroundColor: colors.successSoft },
  group: { gap: 10, marginTop: spacing.sm }, groupHead: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 4 }, groupCopy: { flex: 1 }, groupTitle: { color: colors.chalk, fontFamily: fonts.display, fontSize: 25, textTransform: 'uppercase' }, description: { marginTop: 3, color: colors.chalk45, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 }, groupCount: { color: colors.chalk45, fontFamily: fonts.mono, fontSize: 10 },
  gameCard: { ...shadows.card, position: 'relative', minHeight: 106, justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 21, backgroundColor: colors.ink850, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 30 }, gameCardWaiting: { borderColor: 'rgba(253,230,138,0.25)' }, cardDate: { position: 'absolute', left: 13, top: 10, color: colors.chalk45, fontFamily: fonts.mono, fontSize: 8 }, cardStatus: { position: 'absolute', right: 13, top: 8, overflow: 'hidden', color: colors.chalkMuted, fontFamily: fonts.sansBlack, fontSize: 7, letterSpacing: 0.6, borderRadius: radius.pill, backgroundColor: 'rgba(245,242,232,0.05)', paddingHorizontal: 8, paddingVertical: 5 }, livePill: { color: '#FCA5A5', backgroundColor: colors.dangerSoft }, waitingPill: { color: '#FDE68A', backgroundColor: 'rgba(253,230,138,0.08)' }, finalPill: { color: colors.turf400, backgroundColor: colors.successSoft }, cardMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }, teamReverse: { flexDirection: 'row-reverse' }, teamName: { color: colors.chalk85, fontFamily: fonts.sansBold, fontSize: 10 }, cardScore: { minWidth: 72, color: colors.chalk, fontFamily: fonts.monoBold, fontSize: 19, textAlign: 'center' },
});
