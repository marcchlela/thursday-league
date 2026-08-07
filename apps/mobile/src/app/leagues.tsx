import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { friendlyMobileError } from '@/lib/api';
import { useLeagues } from '@/providers/LeagueProvider';

export default function LeagueSwitcherScreen() {
  const router = useRouter();
  const { leagues, memberships, activeLeague, loading, switching, error, switchLeague } = useLeagues();
  const [message, setMessage] = useState<string | null>(null);

  async function select(leagueId: string) {
    const target = leagues.find(item => item.id === leagueId);
    if (!target) return;
    if (target.id === activeLeague?.id) {
      router.back();
      return;
    }
    setMessage(null);
    try {
      await switchLeague(leagueId);
      router.replace({ pathname: '/l/[slug]', params: { slug: target.slug } });
    } catch (switchError) {
      setMessage(friendlyMobileError(switchError, 'The league could not be switched.'));
    }
  }

  if (loading || switching) return <Loading label={switching ? 'Switching leagues securely...' : 'Loading your leagues...'} />;
  return <Screen><Eyebrow>LEAGUE SWITCHER</Eyebrow><Title>Your leagues.</Title><Body>Each league keeps its own games, players, Fantasy, betting balance and history.</Body>{error || message ? <Message tone="error">{error || message}</Message> : null}<Card>{leagues.map(league => { const membership = memberships.find(item => item.league_id === league.id); const current = activeLeague?.id === league.id; return <Pressable key={league.id} accessibilityRole="button" accessibilityState={{ selected: current }} onPress={() => select(league.id)} style={[styles.row, current && styles.rowCurrent]}><View style={styles.badge}><Text style={styles.badgeText}>{league.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.copy}><Text style={styles.name}>{league.name}</Text><Text style={styles.detail}>{membership?.role || 'member'} · {league.join_code}</Text></View><Text style={[styles.action, current && styles.current]}>{current ? 'Current' : 'Open'}</Text></Pressable>; })}</Card><Button onPress={() => router.push('/league-entry')}>+ Add league</Button><Button variant="secondary" onPress={() => router.back()}>Close</Button></Screen>;
}

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.md, padding: spacing.sm },
  rowCurrent: { borderColor: colors.goldMuted, backgroundColor: colors.ink800 },
  badge: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldMuted, backgroundColor: colors.ink900 },
  badgeText: { color: colors.gold, fontSize: 18, fontWeight: '900' },
  copy: { flex: 1 },
  name: { color: colors.chalk, fontSize: 15, fontWeight: '900' },
  detail: { marginTop: 3, color: colors.chalkMuted, fontSize: 11, textTransform: 'capitalize' },
  action: { color: colors.gold, fontSize: 12, fontWeight: '900' },
  current: { color: colors.turf400 },
});
