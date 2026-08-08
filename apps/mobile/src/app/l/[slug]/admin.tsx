import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack, AdminHero } from '@/components/AdminChrome';
import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, Icon, Loading, Message, Screen } from '@/components/ui';
import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';

export default function LeagueAdminScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { league, membership, loading, switching } = useScopedLeague(slug);
  if (loading || switching || !league) return <Loading label="Loading League Admin..." />;
  const allowed = membership?.role === 'owner' || membership?.role === 'admin';
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message><Button onPress={() => router.replace(`/l/${league.slug}`)}>Back to league</Button></Screen>;
  const sections = [
    { title: 'Games & lineups', detail: 'Schedule matches, set teams, record stats and publish results.', path: `/l/${league.slug}/admin/games`, icon: { ios: 'sportscourt.fill', android: 'sports_soccer' } as const, kicker: 'MATCH CONTROL' },
    { title: 'Roster', detail: 'Add players and manage Fantasy or individual market eligibility.', path: `/l/${league.slug}/admin/roster`, icon: { ios: 'person.3.fill', android: 'groups' } as const, kicker: 'PLAYER CONTROL' },
    { title: 'Seasons', detail: 'Use yearly seasons or create a custom competition window.', path: `/l/${league.slug}/admin/seasons`, icon: { ios: 'calendar.badge.clock', android: 'date_range' } as const, kicker: 'COMPETITION' },
    { title: 'Members', detail: 'Approve requests, share invites and manage league roles.', path: `/l/${league.slug}/members`, icon: { ios: 'person.2.badge.gearshape.fill', android: 'manage_accounts' } as const, kicker: 'ACCESS' },
    { title: 'League settings', detail: 'Update the name or turn Fantasy and predictions on or off.', path: `/l/${league.slug}/admin/settings`, icon: { ios: 'slider.horizontal.3', android: 'tune' } as const, kicker: 'OPTIONS' },
    { title: 'Audit history', detail: 'Review the latest controlled league and match-management changes.', path: `/l/${league.slug}/admin/audit`, icon: { ios: 'clock.arrow.circlepath', android: 'history' } as const, kicker: 'ACCOUNTABILITY' },
  ];
  return <Screen header={<LeagueHeader league={league} />} bottomBar={<LeagueNav league={league} admin />} compact>
    <AdminBack label="League home" onPress={() => router.replace(`/l/${league.slug}`)} />
    <AdminHero eyebrow={membership.role === 'owner' ? 'LEAGUE OWNER' : 'LEAGUE ADMIN'} title="League Admin." text={`The controls needed to run ${league.name}. Platform notifications and prediction intelligence stay managed by Thursday League.`} icon={{ ios: 'shield.lefthalf.filled', android: 'admin_panel_settings' }} />
    <View style={styles.grid}>{sections.map(section => <Pressable key={section.path} accessibilityRole="button" onPress={() => router.push(section.path)} style={({ pressed }) => [styles.section, pressed && styles.pressed]}><View style={styles.sectionTop}><View style={styles.icon}><Icon name={section.icon} size={22} color={colors.gold} /></View><Text style={styles.kicker}>{section.kicker}</Text><Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={18} color={colors.chalk30} /></View><Text style={styles.title}>{section.title}</Text><Text style={styles.detail}>{section.detail}</Text></Pressable>)}</View>
    <Card style={styles.security}><View style={styles.securityIcon}><Icon name={{ ios: 'lock.shield.fill', android: 'enhanced_encryption' }} size={19} color={colors.turf400} /></View><View style={styles.securityCopy}><Text style={styles.securityTitle}>League-scoped access</Text><Body>Every change is checked by protected database rules. This area cannot read or change another league.</Body></View></Card>
  </Screen>;
}

const styles = StyleSheet.create({ grid: { gap: spacing.sm }, section: { ...shadows.card, minHeight: 142, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.md }, pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] }, sectionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, backgroundColor: colors.goldSoft }, kicker: { flex: 1, color: colors.goldMuted, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.4 }, title: { marginTop: spacing.md, color: colors.chalk, fontFamily: fonts.display, fontSize: 24, textTransform: 'uppercase' }, detail: { marginTop: 5, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 }, security: { flexDirection: 'row', alignItems: 'flex-start' }, securityIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.successSoft }, securityCopy: { flex: 1 }, securityTitle: { color: colors.chalk, fontFamily: fonts.display, fontSize: 21, textTransform: 'uppercase' } });
