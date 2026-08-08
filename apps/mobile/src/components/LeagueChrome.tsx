import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { LeagueCoin } from '@/components/LeagueCoin';
import { Icon } from '@/components/ui';
import { colors, fonts, radius, shadows } from '@/constants/theme';
import type { League } from '@/lib/types';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useLeagues } from '@/providers/LeagueProvider';

const logo = require('../../assets/images/splash-icon.png');

export function LeagueHeader({ league }: { league: League }) {
  const router = useRouter();
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!league.betting_enabled || !user) return;
    let active = true;
    void getSupabaseClient().from('betting_wallets').select('balance_units').eq('league_id', league.id).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle().then(result => {
      if (active && !result.error) setBalance(result.data ? Number(result.data.balance_units) : null);
    });
    return () => { active = false; };
  }, [league.betting_enabled, league.id, user]);
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="League home" hitSlop={6} onPress={() => router.push(`/l/${league.slug}`)} style={({ pressed }) => [styles.logoButton, pressed && styles.pressed]}>
        <Image source={logo} resizeMode="contain" style={styles.logo} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Current league ${league.name}. Switch league.`} onPress={() => router.push('/leagues')} style={({ pressed }) => [styles.switcher, pressed && styles.pressed]}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>LEAGUE</Text>
          <Text numberOfLines={1} style={styles.headerName}>{league.name}</Text>
        </View>
        <Icon name={{ ios: 'chevron.down', android: 'keyboard_arrow_down' }} size={17} color={colors.chalk45} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Players" onPress={() => router.push(`/l/${league.slug}/players`)} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
        <Icon name={{ ios: 'person.2.fill', android: 'group' }} size={17} color={colors.chalkMuted} />
        <Text style={styles.headerActionText}>Players</Text>
      </Pressable>
      {league.betting_enabled ? (
        <Pressable accessibilityRole="button" accessibilityLabel={balance == null ? 'Predictions and coin wallet' : `${balance / 100} league coins`} onPress={() => router.push(`/l/${league.slug}/bets`)} style={({ pressed }) => [styles.balanceAction, pressed && styles.pressed]}>
          <LeagueCoin size={25} /><Text numberOfLines={1} style={styles.balanceText}>{balance == null ? '—' : formatCoins(balance)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LeagueNav({ league, admin = false }: { league: League; admin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { memberships } = useLeagues();
  const role = memberships.find(item => item.league_id === league.id)?.role;
  const showAdmin = admin || role === 'owner' || role === 'admin';
  const items = [
    { label: 'Home', path: `/l/${league.slug}`, icon: { ios: 'house.fill', android: 'home' } as const },
    { label: 'Games', path: `/l/${league.slug}/games`, icon: { ios: 'list.bullet.rectangle.fill', android: 'format_list_bulleted' } as const },
    { label: 'Play', path: league.fantasy_enabled ? `/l/${league.slug}/fantasy` : `/l/${league.slug}/bets`, icon: { ios: 'trophy.fill', android: 'emoji_events' } as const },
    { label: 'Profile', path: `/l/${league.slug}/profile`, icon: { ios: 'person.crop.circle.fill', android: 'account_circle' } as const },
    ...(showAdmin ? [{ label: 'Admin', path: `/l/${league.slug}/admin`, icon: { ios: 'shield.fill', android: 'shield' } as const }] : []),
  ];

  return (
    <View style={styles.nav} accessibilityRole="tablist">
      {items.map(item => {
        const active = item.path === `/l/${league.slug}`
          ? pathname === item.path
          : item.label === 'Play'
            ? pathname.startsWith(`/l/${league.slug}/fantasy`) || pathname.startsWith(`/l/${league.slug}/bet`)
            : item.label === 'Profile'
              ? pathname.startsWith(item.path) || pathname.startsWith(`/l/${league.slug}/settings`) || pathname.startsWith(`/l/${league.slug}/account-security`) || pathname.startsWith(`/l/${league.slug}/notifications`) || pathname.startsWith(`/l/${league.slug}/profile-photo`)
              : pathname.startsWith(item.path);
        return (
          <Pressable key={item.path} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => router.push(item.path)} style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}>
            <Icon name={item.icon} size={19} color={active ? colors.gold : colors.chalkMuted} />
            <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

(LeagueHeader as typeof LeagueHeader & { chromeSlot: 'header' }).chromeSlot = 'header';
(LeagueHeader as typeof LeagueHeader & { chromeBottom: (props: { league: League }) => ReactNode }).chromeBottom = ({ league }) => <LeagueNav league={league} />;
(LeagueNav as typeof LeagueNav & { chromeSlot: 'bottom' }).chromeSlot = 'bottom';

const styles = StyleSheet.create({
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(218,165,32,0.1)', backgroundColor: 'rgba(17,17,15,0.97)', paddingHorizontal: 10, paddingVertical: 8 },
  logoButton: { width: 39, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  logo: { width: 40, height: 40 },
  switcher: { flex: 1, minWidth: 0, maxWidth: 180, height: 42, flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: 'rgba(218,165,32,0.18)', borderRadius: radius.sm, backgroundColor: colors.ink850, paddingHorizontal: 8 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: 'rgba(218,165,32,0.62)', fontFamily: fonts.sansBlack, fontSize: 7, letterSpacing: 1.25 },
  headerName: { marginTop: 1, color: colors.chalk85, fontFamily: fonts.sansExtraBold, fontSize: 12 },
  headerAction: { minWidth: 68, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(218,165,32,0.15)', borderRadius: radius.sm, backgroundColor: colors.ink850, paddingHorizontal: 7 },
  headerActionText: { color: colors.chalk72, fontFamily: fonts.sansBold, fontSize: 9 },
  balanceAction: { minWidth: 62, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: 'rgba(218,165,32,0.15)', borderRadius: radius.sm, backgroundColor: colors.ink850, paddingHorizontal: 5 },
  balanceText: { maxWidth: 34, color: colors.chalk72, fontFamily: fonts.monoBold, fontSize: 9 },
  nav: { ...shadows.floating, flexDirection: 'row', gap: 3, borderTopWidth: 1, borderTopColor: 'rgba(218,165,32,0.3)', backgroundColor: 'rgba(17,17,15,0.98)', paddingHorizontal: 7, paddingBottom: 5, paddingTop: 6 },
  navItem: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.sm },
  navItemActive: { backgroundColor: colors.goldSoft },
  navText: { color: colors.chalkMuted, fontFamily: fonts.sansSemiBold, fontSize: 10 },
  navTextActive: { color: colors.gold, fontFamily: fonts.sansBold },
  pressed: { opacity: 0.72 },
});

function formatCoins(units: number) { return (units / 100).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
