import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';

export default function LeagueAdminScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, membership, loading, switching } = useScopedLeague(slug);
  if (loading || switching || !league) return <Loading label="Loading League Admin..." />;
  const allowed = membership?.role === 'owner' || membership?.role === 'admin';
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message><Button onPress={() => router.replace(`/l/${league.slug}`)}>Back to league</Button></Screen>;
  const sections = [
    { title: 'Games & lineups', detail: 'Schedule matches, set both teams, record stats and publish results.', path: `/l/${league.slug}/admin/games` },
    { title: 'Roster', detail: 'Add players and control Fantasy or individual market eligibility.', path: `/l/${league.slug}/admin/roster` },
    { title: 'Seasons', detail: 'Use yearly seasons or create a custom competition window.', path: `/l/${league.slug}/admin/seasons` },
    { title: 'Members', detail: 'Approve requests and manage league roles.', path: `/l/${league.slug}/members` },
    { title: 'League settings', detail: 'Update the name or turn Fantasy and predictions on or off.', path: `/l/${league.slug}/admin/settings` },
  ];
  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.replace(`/l/${league.slug}`)}>← League home</Button><Eyebrow>{membership.role === 'owner' ? 'LEAGUE OWNER' : 'LEAGUE ADMIN'}</Eyebrow><Title>League Admin.</Title><Body>Only controls needed to run {league.name}. Platform notifications and model details stay managed by the app.</Body><View style={styles.grid}>{sections.map(section => <Pressable key={section.path} accessibilityRole="button" onPress={() => router.push(section.path)} style={({ pressed }) => [styles.section, pressed && styles.pressed]}><Text style={styles.title}>{section.title}</Text><Text style={styles.detail}>{section.detail}</Text><Text style={styles.open}>Open →</Text></Pressable>)}</View><Card><Text style={styles.securityTitle}>League-scoped access</Text><Text style={styles.detail}>Every action is checked again by database policies or controlled functions. This admin area cannot read or change another league.</Text></Card></Screen>;
}

const styles = StyleSheet.create({ grid: { gap: spacing.sm }, section: { minHeight: 124, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.md }, pressed: { opacity: 0.75 }, title: { color: colors.chalk, fontSize: 18, fontWeight: '900' }, detail: { flex: 1, marginTop: spacing.sm, color: colors.chalkMuted, fontSize: 11, lineHeight: 16 }, open: { color: colors.gold, fontSize: 11, fontWeight: '900' }, securityTitle: { color: colors.chalk, fontSize: 17, fontWeight: '900' } });
