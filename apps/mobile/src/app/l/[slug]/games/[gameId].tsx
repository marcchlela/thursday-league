import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { calculateScore, formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game, GameLineup, GamePlayerStat, MatchEvent, Player, TeamCode } from '@/lib/types';

export default function GameDetailScreen() {
  const router = useRouter();
  const { slug, gameId } = useLocalSearchParams<{ slug: string; gameId: string }>();
  const { league, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<GamePlayerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!league || !gameId) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('games').select('*').eq('league_id', league.id).eq('id', gameId).maybeSingle(),
      supabase.from('players').select('*').eq('league_id', league.id),
      supabase.from('game_lineups').select('*').eq('league_id', league.id).eq('game_id', gameId).order('slot_index'),
      supabase.from('events').select('*').eq('league_id', league.id).eq('game_id', gameId).order('created_at'),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id).eq('game_id', gameId),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) return setError(friendlyMobileError(failure, 'Match details could not be loaded.'));
    setGame((responses[0].data || null) as Game | null);
    setPlayers((responses[1].data || []) as Player[]);
    setLineups((responses[2].data || []) as GameLineup[]);
    setEvents((responses[3].data || []) as MatchEvent[]);
    setStats((responses[4].data || []) as GamePlayerStat[]);
  }, [gameId, league]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  if (leagueLoading || switching || loading || !league) return <Loading label="Loading match details..." />;
  if (!game) return <Screen><Message tone="error">{error || 'This match is not available.'}</Message><Button onPress={() => router.back()}>Back to games</Button></Screen>;
  const score = calculateScore(events, lineups, stats);
  const showScore = game.status === 'live' || game.status === 'final';
  const playerName = (id: string) => players.find(player => player.id === id)?.name || 'Unknown player';

  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.back()}>← All games</Button><Eyebrow>{game.status === 'live' ? 'LIVE MATCH' : game.status === 'final' ? 'FULL TIME' : 'MATCH PREVIEW'}</Eyebrow><Title>{showScore ? `${score.A} - ${score.B}` : 'Team A vs Team B'}</Title><Body>{formatMatchTime(game.game_date)} · shown in your device timezone</Body>{error ? <Message tone="error">{error}</Message> : null}<View style={styles.teams}><TeamLineup team="A" lineups={lineups} stats={stats} playerName={playerName} /><TeamLineup team="B" lineups={lineups} stats={stats} playerName={playerName} /></View>{events.length ? <Card><Text style={styles.sectionTitle}>Match events</Text>{events.map(event => <View key={event.id} style={styles.event}><Text style={styles.eventMain}>{event.event_type === 'own_goal' ? 'Own goal' : 'Goal'} · {playerName(event.player_id)}</Text><Text style={styles.eventMeta}>{event.assist_player_id ? `Assist ${playerName(event.assist_player_id)}` : 'No assist'}{event.minute != null ? ` · ${event.minute}'` : ''}</Text></View>)}</Card> : <Card><Text style={styles.sectionTitle}>{lineups.length ? 'No events yet' : 'Lineups pending'}</Text><Text style={styles.eventMeta}>{lineups.length ? 'Live events and the final stat grid will appear here.' : 'A league admin has not saved both teams yet.'}</Text></Card>}<Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/fantasy`)}>Open Fantasy</Button>{league.betting_enabled ? <Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/bets`)}>Open predictions</Button> : null}</Screen>;
}

function TeamLineup({ team, lineups, stats, playerName }: { team: TeamCode; lineups: GameLineup[]; stats: GamePlayerStat[]; playerName: (id: string) => string }) {
  const rows = lineups.filter(item => item.team === team);
  return <Card style={styles.teamCard}><Text style={styles.teamTitle}>Team {team}</Text>{rows.length ? rows.map(row => { const stat = stats.find(item => item.player_id === row.player_id); return <View key={row.id} style={styles.playerRow}><View style={styles.playerCopy}><Text style={styles.playerName}>{playerName(row.player_id)}</Text><Text style={styles.role}>{row.role === 'goalkeeper' ? 'Goalkeeper' : 'Outfield'}</Text></View>{stat ? <Text style={styles.stat}>{stat.goals}G · {stat.assists}A · {stat.saves}S</Text> : null}</View>; }) : <Text style={styles.eventMeta}>Not set</Text>}</Card>;
}

const styles = StyleSheet.create({ teams: { gap: spacing.md }, teamCard: { padding: spacing.md }, teamTitle: { color: colors.gold, fontSize: 18, fontWeight: '900' }, playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, playerCopy: { flex: 1 }, playerName: { color: colors.chalk, fontSize: 14, fontWeight: '800' }, role: { marginTop: 2, color: colors.chalkMuted, fontSize: 10 }, stat: { color: colors.gold, fontSize: 11, fontWeight: '900' }, sectionTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' }, event: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, eventMain: { color: colors.chalk, fontSize: 14, fontWeight: '800' }, eventMeta: { marginTop: 2, color: colors.chalkMuted, fontSize: 11, lineHeight: 16 } });
