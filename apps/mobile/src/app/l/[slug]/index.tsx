import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { takeAuthNotice } from '@/lib/onboarding';
import { formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { BetSlip, FantasySquad, Game, GameLineup } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Availability = { unlocked: boolean; completed_games: number; required_games: number };

export default function LeagueHomeScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user, profile } = useAuth();
  const { league, membership, loading: leagueLoading, switching, error: leagueError } = useScopedLeague(slug);
  const [games, setGames] = useState<Game[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [squads, setSquads] = useState<FantasySquad[]>([]);
  const [slips, setSlips] = useState<BetSlip[]>([]);
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
  }, [league, user]);

  useEffect(() => { void takeAuthNotice().then(notice => { if (notice) setMessage(notice); }); }, []);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  if (leagueLoading || switching || !league) return <Loading label="Loading your matchweek..." />;

  const nextGame = games.filter(game => game.status !== 'final').sort((first, second) => first.status === 'live' ? -1 : second.status === 'live' ? 1 : new Date(first.game_date).getTime() - new Date(second.game_date).getTime())[0] || null;
  const nextLineups = nextGame ? lineups.filter(item => item.game_id === nextGame.id) : [];
  const fantasyReady = !!nextGame && squads.some(item => item.game_id === nextGame.id);
  const predictionReady = !!nextGame && slips.some(item => item.game_id === nextGame.id && item.status !== 'cashed_out');
  const admin = membership?.role === 'owner' || membership?.role === 'admin';

  return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><Eyebrow>MATCHWEEK HOME</Eyebrow><Title>Welcome, {profile?.username}.</Title><Body>{nextGame ? `Your next ${league.name} matchweek is taking shape.` : `Everything for ${league.name} starts here.`}</Body>{leagueError || message ? <Message tone={leagueError || message?.includes('could not') ? 'error' : 'success'}>{leagueError || message}</Message> : null}{loading ? <Card><Text style={styles.muted}>Loading readiness...</Text></Card> : nextGame ? <Card><View style={styles.matchHeader}><View><Text style={styles.cardKicker}>{nextGame.status === 'live' ? 'LIVE NOW' : 'NEXT MATCH'}</Text><Text style={styles.matchDate}>{formatMatchTime(nextGame.game_date)}</Text></View><Text style={[styles.matchStatus, nextGame.status === 'live' && styles.live]}>{nextGame.status}</Text></View><View style={styles.versus}><Text style={styles.team}>TEAM A</Text><Text style={styles.vs}>VS</Text><Text style={[styles.team, styles.teamRight]}>TEAM B</Text></View><View style={styles.readiness}><Readiness label="Lineups" ready={nextLineups.length === 10} detail={nextLineups.length === 10 ? 'Ready' : `${nextLineups.length}/10`} /><Readiness label="Fantasy" ready={fantasyReady} detail={fantasyReady ? 'Saved' : 'Not set'} /><Readiness label="Predictions" ready={predictionReady} detail={!league.betting_enabled ? 'Off' : availability && !availability.unlocked ? `${availability.completed_games}/${availability.required_games}` : predictionReady ? 'Placed' : 'Open'} /></View><Button onPress={() => router.push(`/l/${league.slug}/games/${nextGame.id}`)}>Open match</Button></Card> : <Card><Text style={styles.emptyTitle}>Your league is ready</Text><Text style={styles.muted}>{admin ? 'Add the roster, then schedule your first game from League Admin.' : 'A league admin will add the roster and schedule the first game.'}</Text>{admin ? <Button onPress={() => router.push(`/l/${league.slug}/admin`)}>Continue league setup</Button> : null}</Card>}<View style={styles.grid}><Feature title="Games" detail="Fixtures, lineups and results" onPress={() => router.push(`/l/${league.slug}/games`)} /><Feature title="Players" detail="Roster and career statistics" onPress={() => router.push(`/l/${league.slug}/players`)} /><Feature title="Fantasy" detail={league.fantasy_enabled ? 'Pick five and a 2x captain' : 'Disabled in this league'} onPress={() => router.push(`/l/${league.slug}/fantasy`)} /><Feature title="Predictions" detail={!league.betting_enabled ? 'Disabled in this league' : availability && !availability.unlocked ? `${availability.completed_games}/${availability.required_games} completed games` : 'Markets and your coin wallet'} onPress={() => router.push(`/l/${league.slug}/bets`)} /></View>{admin ? <Card><Text style={styles.adminTitle}>League admin</Text><Text style={styles.muted}>{"Manage only this league's games, roster, season and members."}</Text><Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/admin`)}>Open League Admin</Button></Card> : null}<Button variant="secondary" onPress={load}>Refresh home</Button></Screen>;
}

function Readiness({ label, ready, detail }: { label: string; ready: boolean; detail: string }) { return <View style={styles.readyItem}><Text style={[styles.readyIcon, ready && styles.readyIconOn]}>{ready ? '✓' : '·'}</Text><Text style={styles.readyLabel}>{label}</Text><Text style={[styles.readyDetail, ready && styles.readyDetailOn]}>{detail}</Text></View>; }
function Feature({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.feature, pressed && styles.pressed]}><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureDetail}>{detail}</Text><Text style={styles.featureOpen}>Open →</Text></Pressable>; }

const styles = StyleSheet.create({
  muted: { color: colors.chalkMuted, fontSize: 12, lineHeight: 18 },
  cardKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  matchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  matchDate: { marginTop: 4, color: colors.chalk, fontSize: 14, fontWeight: '800' },
  matchStatus: { color: colors.gold, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  live: { color: colors.turf400 },
  versus: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  team: { flex: 1, color: colors.chalk, fontSize: 17, fontWeight: '900' },
  teamRight: { textAlign: 'right' },
  vs: { color: colors.gold, fontSize: 14, fontWeight: '900' },
  readiness: { gap: spacing.sm },
  readyItem: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  readyIcon: { width: 24, height: 24, color: colors.chalkMuted, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  readyIconOn: { color: colors.turf400 },
  readyLabel: { flex: 1, color: colors.chalk, fontSize: 12, fontWeight: '800' },
  readyDetail: { color: colors.chalkMuted, fontSize: 11 },
  readyDetailOn: { color: colors.turf400 },
  emptyTitle: { color: colors.chalk, fontSize: 20, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  feature: { width: '48.5%', minHeight: 140, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.md },
  pressed: { opacity: 0.75 },
  featureTitle: { color: colors.chalk, fontSize: 17, fontWeight: '900' },
  featureDetail: { flex: 1, marginTop: spacing.sm, color: colors.chalkMuted, fontSize: 11, lineHeight: 16 },
  featureOpen: { color: colors.gold, fontSize: 11, fontWeight: '900' },
  adminTitle: { color: colors.chalk, fontSize: 19, fontWeight: '900' },
});
