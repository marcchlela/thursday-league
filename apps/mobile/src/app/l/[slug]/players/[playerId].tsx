import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { careerStats } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { Game, GameLineup, GamePlayerStat, MatchEvent, Player } from '@/lib/types';

export default function PlayerDetailScreen() {
  const router = useRouter();
  const { slug, playerId } = useLocalSearchParams<{ slug: string; playerId: string }>();
  const { league, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [player, setPlayer] = useState<Player | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<GamePlayerStat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!league) return;
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.from('players').select('*').eq('league_id', league.id).eq('id', playerId).maybeSingle(),
      supabase.from('games').select('*').eq('league_id', league.id),
      supabase.from('game_lineups').select('*').eq('league_id', league.id).eq('player_id', playerId),
      supabase.from('events').select('*').eq('league_id', league.id).or(`player_id.eq.${playerId},assist_player_id.eq.${playerId}`),
      supabase.from('game_player_stats').select('*').eq('league_id', league.id).eq('player_id', playerId),
    ]);
    setPlayer((responses[0].data || null) as Player | null);
    setGames((responses[1].data || []) as Game[]);
    setLineups((responses[2].data || []) as GameLineup[]);
    setEvents((responses[3].data || []) as MatchEvent[]);
    setStats((responses[4].data || []) as GamePlayerStat[]);
    setLoading(false);
  }, [league, playerId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  if (leagueLoading || switching || loading || !league) return <Loading label="Loading player profile..." />;
  if (!player) return <Screen><Message tone="error">This player is not available in this league.</Message><Button onPress={() => router.back()}>Back to players</Button></Screen>;
  const totals = careerStats({ player, games, lineups, events, stats });
  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.back()}>← All players</Button><View style={styles.hero}><Avatar name={player.name} size={92} /><Eyebrow>{player.player_type === 'guest' ? 'GUEST PLAYER' : player.default_position === 'goalkeeper' ? 'GOALKEEPER' : 'OUTFIELD PLAYER'}</Eyebrow><Title>{player.name}</Title><Body>All-time performance inside {league.name}.</Body></View><View style={styles.grid}><Stat label="Appearances" value={totals.appearances} /><Stat label="Goals" value={totals.goals} /><Stat label="Assists" value={totals.assists} /><Stat label="Saves" value={totals.saves} /><Stat label="Clean sheets" value={totals.cleanSheets} /><Stat label="Own goals" value={totals.ownGoals} /></View><Card><Text style={styles.noteTitle}>Competition access</Text><Text style={styles.note}>{player.fantasy_eligible === false ? 'Not eligible for Fantasy.' : 'Available for Fantasy when selected in a lineup.'}</Text><Text style={styles.note}>{player.individual_betting_eligible === false ? 'Individual prediction markets are off.' : 'Individual prediction markets may be generated after betting unlocks.'}</Text></Card></Screen>;
}

function Stat({ label, value }: { label: string; value: number }) { return <View style={styles.stat}><Text style={styles.value}>{value}</Text><Text style={styles.label}>{label}</Text></View>; }
const styles = StyleSheet.create({ hero: { alignItems: 'center', gap: spacing.sm }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, stat: { width: '31.5%', minHeight: 92, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: 18, backgroundColor: colors.ink850 }, value: { color: colors.chalk, fontSize: 26, fontWeight: '900' }, label: { marginTop: 4, color: colors.chalkMuted, fontSize: 9, textAlign: 'center' }, noteTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' }, note: { color: colors.chalkMuted, fontSize: 12, lineHeight: 18 } });
