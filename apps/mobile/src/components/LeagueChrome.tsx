import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { colors, radius, spacing } from '@/constants/theme';
import type { League } from '@/lib/types';

export function LeagueHeader({ league }: { league: League }) {
  const router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Current league ${league.name}. Switch league.`} onPress={() => router.push('/leagues')} style={styles.header}><View style={styles.badge}><Text style={styles.badgeText}>{league.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.headerCopy}><Text numberOfLines={1} style={styles.headerName}>{league.name}</Text><Text style={styles.headerHint}>Switch league</Text></View><Text style={styles.chevron}>⌄</Text></Pressable>;
}

export function LeagueNav({ league }: { league: League }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = [
    { label: 'Home', path: `/l/${league.slug}` },
    { label: 'Games', path: `/l/${league.slug}/games` },
    { label: 'Play', path: `/l/${league.slug}/fantasy` },
    { label: 'Profile', path: `/l/${league.slug}/profile` },
  ];
  return <View style={styles.nav} accessibilityRole="tablist">{items.map(item => { const active = item.path === `/l/${league.slug}` ? pathname === item.path : pathname.startsWith(item.path); return <Pressable key={item.path} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => router.push(item.path)} style={[styles.navItem, active && styles.navItemActive]}><Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text></Pressable>; })}</View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, backgroundColor: colors.ink850, padding: spacing.sm },
  badge: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.ink800 },
  badgeText: { color: colors.gold, fontSize: 17, fontWeight: '900' },
  headerCopy: { flex: 1 },
  headerName: { color: colors.chalk, fontSize: 14, fontWeight: '900' },
  headerHint: { marginTop: 2, color: colors.chalkMuted, fontSize: 10 },
  chevron: { color: colors.gold, fontSize: 20 },
  nav: { flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, backgroundColor: colors.ink850, padding: 4 },
  navItem: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  navItemActive: { backgroundColor: colors.ink800 },
  navText: { color: colors.chalkMuted, fontSize: 11, fontWeight: '800' },
  navTextActive: { color: colors.gold },
});
