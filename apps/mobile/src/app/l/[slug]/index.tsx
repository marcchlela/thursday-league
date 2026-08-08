import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { TeamCrest } from '@/components/TeamCrest';
import { Button, Card, EmptyState, Icon, Loading, Message, Screen } from '@/components/ui';
import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { takeAuthNotice } from '@/lib/onboarding';
import { calculateScore, careerStats, formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { BetSlip, FantasySquad, Game, GameLineup, GamePlayerStat, MatchEvent, Player } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Availability = { unlocked: boolean; completed_games: number; required_games: number };

export default function LeagueHomeScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const { league, membership, loading: leagueLoading, switching, error: leagueError } = useScopedLeague(slug);
  const [games, setGames] = useState<Game[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [squads, setSquads] = useState<FantasySquad[]>([]);
  const [slips, setSlips] = useState<BetSlip[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [playerStats, setPlayerStats] = useState<GamePlayerStat[]>([]);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!league || !user) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('games').select('*').eq('league_id', league.id).order('game_date'),
      supabase.from('game_lineups').select('*').eq('league_id', league.id),
      supabase.from('fantasy_squads').select('*').eq('league_id', league.id).eq('user_id', user.id),
      supabase.from('bet_slips').select('*').eq('league_id', league.id).eq('user_id', user.id),
      supabase.rpc('league_betting_availability', { target_league_id: league.id }),
      supabase.from('players').select('*').eq('league_id', league.id).is('archived_at', null),
      supabase.from('events').select('*').eq('league_id', league.id),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) return setMessage(friendlyMobileError(failure, 'Your matchweek could not be loaded.'));
    setGames((responses[0].data || []) as Game[]);
    setLineups((responses[1].data || []) as GameLineup[]);
    setSquads((responses[2].data || []) as FantasySquad[]);
    setSlips((responses[3].data || []) as BetSlip[]);
    const row = Array.isArray(responses[4].data) ? responses[4].data[0] : responses[4].data;
    setAvailability((row || null) as Availability | null);
    setPlayers((responses[5].data || []) as Player[]);
    setEvents((responses[6].data || []) as MatchEvent[]);
    setPlayerStats((responses[7].data || []) as GamePlayerStat[]);
  }, [league, user]);

  useEffect(() => { void takeAuthNotice().then(notice => { if (notice) setMessage(notice); }); }, []);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const nextGame = useMemo(() => games
    .filter(game => game.status !== 'final')
    .sort((first, second) => first.status === 'live' ? -1 : second.status === 'live' ? 1 : new Date(first.game_date).getTime() - new Date(second.game_date).getTime())[0] || null, [games]);
  const recentFinal = useMemo(() => [...games].filter(game => game.status === 'final').sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime())[0] || null, [games]);
  const leaders = useMemo(() => {
    const rows = players.map(player => ({ player, stats: careerStats({ player, games, lineups, events, stats: playerStats }) }));
    const rank = (field: 'goals' | 'assists') => [...rows].sort((a, b) => b.stats[field] - a.stats[field] || a.player.name.localeCompare(b.player.name)).slice(0, 5);
    return { goals: rank('goals'), assists: rank('assists') };
  }, [events, games, lineups, playerStats, players]);

  if (leagueLoading || switching || !league) return <Loading label="Loading your matchweek..." />;

  const nextLineups = nextGame ? lineups.filter(item => item.game_id === nextGame.id) : [];
  const fantasyReady = !!nextGame && squads.some(item => item.game_id === nextGame.id);
  const predictionReady = !!nextGame && slips.some(item => item.game_id === nextGame.id && item.status !== 'cashed_out');
  const admin = membership?.role === 'owner' || membership?.role === 'admin';

  return (
    <Screen header={<LeagueHeader league={league} />} bottomBar={<LeagueNav league={league} admin={admin} />} compact>
      {leagueError || message ? <Message tone={leagueError || message?.includes('could not') ? 'error' : 'success'}>{leagueError || message}</Message> : null}
      {loading ? <Card><Text style={styles.muted}>Loading the next match...</Text></Card> : nextGame ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/l/${league.slug}/games/${nextGame.id}`)} style={({ pressed }) => [styles.nextMatch, pressed && styles.pressed]}>
          <View pointerEvents="none" style={styles.pitchGlow} />
          <View pointerEvents="none" style={styles.pitchHalf} />
          <View pointerEvents="none" style={styles.pitchCircle} />
          <View style={styles.matchTop}><Text style={[styles.matchKicker, nextGame.status === 'live' && styles.live]}>{nextGame.status === 'live' ? 'LIVE NOW' : 'NEXT MATCH'}</Text><Icon name={{ ios: 'arrow.up.right', android: 'arrow_outward' }} size={18} color={colors.chalk45} /></View>
          <View style={styles.versus}>
            <TeamIdentity gameId={nextGame.id} team="A" />
            <View style={styles.vsWrap}><Text style={styles.vs}>VS</Text><View style={styles.vsLine} /></View>
            <TeamIdentity gameId={nextGame.id} team="B" />
          </View>
          <View style={styles.matchTimeRow}><Icon name={{ ios: 'calendar', android: 'calendar_month' }} size={15} color={colors.chalkMuted} /><Text style={styles.matchTime}>{formatMatchTime(nextGame.game_date, league.timezone)}</Text></View>
          <View style={[styles.lineupPill, nextLineups.length === 10 && styles.lineupPillReady]}><Icon name={nextLineups.length === 10 ? { ios: 'checkmark.circle.fill', android: 'check_circle' } : { ios: 'circle.dashed', android: 'pending' }} size={15} color={nextLineups.length === 10 ? colors.turf400 : colors.chalkMuted} /><Text style={[styles.lineupText, nextLineups.length === 10 && styles.lineupTextReady]}>{nextLineups.length === 10 ? 'Lineups ready' : 'Lineups not ready yet'}</Text></View>
        </Pressable>
      ) : (
        <EmptyState title="Nothing scheduled yet" text={admin ? 'Add the roster, then schedule the next match from League Admin.' : 'The next match will appear here as soon as a league admin creates it.'} action={admin ? <Button onPress={() => router.push(`/l/${league.slug}/admin`)}>Continue league setup</Button> : undefined} />
      )}

      {!loading && (league.fantasy_enabled || league.betting_enabled) ? (
        <View style={styles.actions}>
          {league.fantasy_enabled ? <HomeAction title={fantasyReady ? 'Team set' : 'Set fantasy team'} detail={fantasyReady ? 'Tap to review' : 'Pick your five'} complete={fantasyReady} tone="green" icon={{ ios: 'tshirt.fill', android: 'checkroom' }} onPress={() => router.push(`/l/${league.slug}/fantasy`)} /> : null}
          {league.betting_enabled ? <HomeAction title={predictionReady ? 'Bet placed' : availability && !availability.unlocked ? 'Betting locked' : 'Place your bet'} detail={predictionReady ? 'Tap to review' : availability && !availability.unlocked ? `${availability.completed_games}/${availability.required_games} · ${Math.max(availability.required_games - availability.completed_games, 0)} games left` : 'Make your picks'} complete={predictionReady} tone="gold" icon={{ ios: 'dice.fill', android: 'casino' }} onPress={() => router.push(`/l/${league.slug}/bets`)} /> : null}
        </View>
      ) : null}

      <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>PREVIOUS GAME</Text><Pressable onPress={() => router.push(`/l/${league.slug}/games`)} hitSlop={10}><Text style={styles.sectionLink}>See all ›</Text></Pressable></View>
      {recentFinal ? <PreviousMatch game={recentFinal} leagueSlug={league.slug} lineups={lineups} events={events} stats={playerStats} /> : <View style={styles.previousEmpty}><Text style={styles.muted}>The first result will appear here.</Text></View>}

      <View style={styles.leaderGrid}>
        <LeaderTable title="Goals" rows={leaders.goals.map(item => ({ id: item.player.id, name: item.player.name, value: item.stats.goals }))} tone="green" leagueSlug={league.slug} />
        <LeaderTable title="Assists" rows={leaders.assists.map(item => ({ id: item.player.id, name: item.player.name, value: item.stats.assists }))} tone="gold" leagueSlug={league.slug} />
      </View>

      {admin ? <Button variant="ghost" icon={{ ios: 'shield.fill', android: 'shield' }} onPress={() => router.push(`/l/${league.slug}/admin`)}>League Admin</Button> : null}
      <Button variant="ghost" onPress={load}>Refresh</Button>
    </Screen>
  );
}

function TeamIdentity({ gameId, team }: { gameId: string; team: 'A' | 'B' }) {
  return <View style={styles.team}><TeamCrest gameId={gameId} team={team} size={74} /><Text style={styles.teamName}>TEAM {team}</Text></View>;
}

function HomeAction({ title, detail, complete, tone, icon, onPress }: { title: string; detail: string; complete: boolean; tone: 'green' | 'gold'; icon: Parameters<typeof Icon>[0]['name']; onPress: () => void }) {
  const color = tone === 'green' ? colors.turf400 : colors.goldBright;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionCard, tone === 'green' ? styles.actionGreen : styles.actionGold, pressed && styles.pressed]}><View style={styles.actionTop}><View style={[styles.actionIcon, { backgroundColor: tone === 'green' ? colors.successSoft : colors.goldSoft }]}><Icon name={icon} size={20} color={color} /></View>{complete ? <View style={styles.completeIcon}><Icon name={{ ios: 'checkmark', android: 'check' }} size={17} color={colors.ink900} /></View> : <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={19} color={colors.chalk45} />}</View><View><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionDetail}>{detail}</Text></View></Pressable>;
}

function PreviousMatch({ game, leagueSlug, lineups, events, stats }: { game: Game; leagueSlug: string; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[] }) {
  const score = calculateScore(events.filter(item => item.game_id === game.id), lineups.filter(item => item.game_id === game.id), stats.filter(item => item.game_id === game.id));
  const router = useRouter();
  return <Pressable accessibilityRole="button" onPress={() => router.push(`/l/${leagueSlug}/games/${game.id}`)} style={({ pressed }) => [styles.previous, pressed && styles.pressed]}><TeamCompact gameId={game.id} team="A" /><View style={styles.previousScoreWrap}><Text style={styles.previousScore}>{score.A}<Text style={styles.scoreDash}>–</Text>{score.B}</Text><Text style={styles.final}>FINAL</Text><Text style={styles.previousDate}>{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(game.game_date))}</Text></View><TeamCompact gameId={game.id} team="B" reverse /></Pressable>;
}

function TeamCompact({ team, reverse, gameId }: { team: 'A' | 'B'; reverse?: boolean; gameId: string }) {
  return <View style={[styles.compactTeam, reverse && styles.compactTeamReverse]}><TeamCrest gameId={gameId} team={team} size={49} /><Text style={styles.compactName}>Team {team}</Text></View>;
}

function LeaderTable({ title, rows, tone, leagueSlug }: { title: string; rows: { id: string; name: string; value: number }[]; tone: 'green' | 'gold'; leagueSlug: string }) {
  const router = useRouter();
  const color = tone === 'green' ? colors.turf400 : colors.gold;
  return <View style={styles.leader}><View style={styles.leaderHeader}><View style={[styles.leaderIcon, { backgroundColor: tone === 'green' ? colors.successSoft : colors.goldSoft }]}><Icon name={tone === 'green' ? { ios: 'soccerball', android: 'sports_soccer' } : { ios: 'figure.soccer', android: 'assist_walker' }} size={17} color={color} /></View><Text style={styles.leaderTitle}>{title}</Text></View>{rows.length ? rows.map((row, index) => <Pressable key={row.id} onPress={() => router.push(`/l/${leagueSlug}/players/${row.id}`)} style={styles.leaderRow}><Text style={styles.rank}>{index + 1}</Text><Text numberOfLines={1} style={styles.leaderName}>{row.name}</Text><Text style={[styles.leaderValue, { color }]}>{row.value}</Text></Pressable>) : <Text style={styles.noStats}>No stats yet</Text>}</View>;
}

const styles = StyleSheet.create({
  muted: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 },
  nextMatch: { ...shadows.card, position: 'relative', minHeight: 246, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(218,165,32,0.3)', borderRadius: radius.xl, backgroundColor: colors.ink850, padding: spacing.md },
  pitchGlow: { position: 'absolute', right: -38, top: -44, width: 120, height: 120, borderRadius: radius.pill, backgroundColor: 'rgba(247,183,51,0.07)' },
  pitchHalf: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '44%', borderTopWidth: 1, borderTopColor: 'rgba(245,242,232,0.05)', backgroundColor: 'rgba(49,185,78,0.045)' },
  pitchCircle: { position: 'absolute', left: '41%', bottom: 20, width: 64, height: 64, borderWidth: 1, borderColor: 'rgba(245,242,232,0.055)', borderRadius: radius.pill },
  matchTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchKicker: { color: colors.turf400, fontFamily: fonts.sansBlack, fontSize: 10, letterSpacing: 1.8 },
  live: { color: colors.danger },
  versus: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  team: { flex: 1, alignItems: 'center', gap: 5 },
  crest: { width: 54, height: 66, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.goldBorderStrong, borderRadius: 18, backgroundColor: colors.ink900 },
  crestLetter: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: 30 },
  teamName: { color: colors.chalk, fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.6 },
  vsWrap: { alignItems: 'center' },
  vs: { color: colors.chalk45, fontFamily: fonts.display, fontSize: 27 },
  vsLine: { width: 28, height: 1, backgroundColor: colors.goldBright },
  matchTimeRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  matchTime: { color: colors.chalk72, fontFamily: fonts.sansMedium, fontSize: 12 },
  lineupPill: { alignSelf: 'center', marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(245,242,232,0.09)', borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 11, paddingVertical: 6 },
  lineupPillReady: { borderColor: 'rgba(49,185,78,0.2)', backgroundColor: colors.successSoft },
  lineupText: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 10 },
  lineupTextReady: { color: colors.turf100 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionCard: { flex: 1, minHeight: 122, justifyContent: 'space-between', overflow: 'hidden', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, padding: 13 },
  actionGreen: { backgroundColor: 'rgba(49,185,78,0.065)' },
  actionGold: { backgroundColor: 'rgba(218,165,32,0.065)' },
  actionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  completeIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.chalk },
  actionTitle: { color: colors.chalk, fontFamily: fonts.sansExtraBold, fontSize: 14 },
  actionDetail: { marginTop: 4, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 14 },
  sectionHeading: { marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: colors.chalkMuted, fontFamily: fonts.sansBlack, fontSize: 10, letterSpacing: 1.4 },
  sectionLink: { color: colors.turf400, fontFamily: fonts.sansBold, fontSize: 11 },
  previous: { ...shadows.card, minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: 13 },
  previousEmpty: { minHeight: 98, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.goldBorder, borderRadius: radius.lg, backgroundColor: 'rgba(245,242,232,0.02)' },
  compactTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  compactTeamReverse: { flexDirection: 'row-reverse' },
  compactCrest: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, backgroundColor: colors.ink800 },
  compactCrestText: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: 18 },
  compactName: { color: colors.chalk85, fontFamily: fonts.sansBold, fontSize: 11 },
  previousScoreWrap: { alignItems: 'center' },
  previousScore: { color: colors.chalk, fontFamily: fonts.monoBold, fontSize: 27 },
  scoreDash: { color: colors.chalk30 },
  final: { marginTop: 2, color: colors.chalk45, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.2 },
  previousDate: { marginTop: 3, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 9 },
  leaderGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  leader: { flex: 1, overflow: 'hidden', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, backgroundColor: colors.ink850 },
  leaderHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(218,165,32,0.15)', padding: 10 },
  leaderIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  leaderTitle: { color: colors.chalk, fontFamily: fonts.sansExtraBold, fontSize: 13 },
  leaderRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(218,165,32,0.18)', paddingHorizontal: 10 },
  rank: { width: 13, color: colors.chalkMuted, fontFamily: fonts.mono, fontSize: 9 },
  leaderName: { flex: 1, color: colors.chalk85, fontFamily: fonts.sansSemiBold, fontSize: 10 },
  leaderValue: { fontFamily: fonts.monoBold, fontSize: 13 },
  noStats: { paddingVertical: spacing.xl, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, textAlign: 'center' },
  pressed: { opacity: 0.77, transform: [{ scale: 0.992 }] },
});
