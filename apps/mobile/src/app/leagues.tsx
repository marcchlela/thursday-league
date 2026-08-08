import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Button, Eyebrow, Icon, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { friendlyMobileError } from '@/lib/api';
import { useLeagues } from '@/providers/LeagueProvider';

export default function LeagueSwitcherScreen() {
  const router = useRouter();
  const { leagues, memberships, activeLeague, loading, switching, error, switchLeague } = useLeagues();
  const [message, setMessage] = useState<string | null>(null);

  async function select(leagueId: string) {
    const target = leagues.find(item => item.id === leagueId);
    if (!target) return;
    if (target.id === activeLeague?.id) return router.back();
    setMessage(null);
    try { await switchLeague(leagueId); router.replace({ pathname: '/l/[slug]', params: { slug: target.slug } }); }
    catch (switchError) { setMessage(friendlyMobileError(switchError, 'The league could not be switched.')); }
  }

  if (loading || switching) return <Loading label={switching ? 'Switching leagues securely...' : 'Loading your leagues...'} />;
  return <Screen compact>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Icon name={{ ios: 'xmark', android: 'close' }} size={18} color={colors.chalkMuted} /></Pressable>
    <View style={styles.head}><Eyebrow>LEAGUE SWITCHER</Eyebrow><Title>Your leagues.</Title><Body>Games, rosters, Fantasy, coins and history stay separate in every league.</Body></View>
    {error || message ? <Message tone="error">{error || message}</Message> : null}
    <View style={styles.list}>{leagues.map(league => { const membership = memberships.find(item => item.league_id === league.id); const current = activeLeague?.id === league.id; return <Pressable key={league.id} accessibilityRole="button" accessibilityState={{ selected: current }} onPress={() => select(league.id)} style={({ pressed }) => [styles.row, current && styles.rowCurrent, pressed && styles.pressed]}><View style={[styles.badge, current && styles.badgeCurrent]}><Text style={styles.badgeText}>{initials(league.name)}</Text></View><View style={styles.copy}><Text numberOfLines={1} style={styles.name}>{league.name}</Text><Text style={styles.detail}>{membership?.role || 'member'} · {league.join_code}</Text></View>{current ? <View style={styles.currentPill}><Text style={styles.current}>Current</Text></View> : <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={18} color={colors.chalk30} />}</Pressable>; })}</View>
    <Pressable accessibilityRole="button" onPress={() => router.push('/league-entry')} style={({ pressed }) => [styles.add, pressed && styles.pressed]}><View style={styles.addIcon}><Icon name={{ ios: 'plus', android: 'add' }} size={21} color={colors.gold} /></View><View style={styles.copy}><Text style={styles.addTitle}>Add a league</Text><Text style={styles.detail}>Join with a code or create your own.</Text></View><Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={18} color={colors.goldMuted} /></Pressable>
    <Button variant="ghost" onPress={() => router.back()}>Close</Button>
  </Screen>;
}

function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'TL'; }
const styles = StyleSheet.create({ close: { alignSelf: 'flex-end', width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 21, backgroundColor: colors.ink850 }, head: { gap: 5 }, list: { gap: spacing.sm }, row: { ...shadows.card, minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.md }, rowCurrent: { borderColor: colors.goldBorderStrong, backgroundColor: '#211D13' }, pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] }, badge: { width: 49, height: 49, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.ink900 }, badgeCurrent: { backgroundColor: colors.goldSoft }, badgeText: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: 19 }, copy: { flex: 1 }, name: { color: colors.chalk, fontFamily: fonts.sansExtraBold, fontSize: 14 }, detail: { marginTop: 4, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14, textTransform: 'capitalize' }, currentPill: { borderWidth: 1, borderColor: 'rgba(49,185,78,0.25)', borderRadius: radius.pill, backgroundColor: colors.successSoft, paddingHorizontal: 9, paddingVertical: 5 }, current: { color: colors.turf400, fontFamily: fonts.sansBlack, fontSize: 8, textTransform: 'uppercase' }, add: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.goldBorderStrong, borderRadius: radius.lg, backgroundColor: colors.goldSoft, padding: spacing.md }, addIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 22 }, addTitle: { color: colors.gold, fontFamily: fonts.display, fontSize: 21, textTransform: 'uppercase' } });
