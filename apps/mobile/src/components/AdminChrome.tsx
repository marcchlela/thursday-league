import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';

import { Body, Eyebrow, Icon, Title } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';

export function AdminBack({ label = 'League Admin', onPress }: { label?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${label}`} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Icon name={{ ios: 'arrow.left', android: 'arrow_back' }} size={15} color={colors.gold} /><Text style={styles.backText}>{label}</Text></Pressable>;
}

export function AdminHero({ eyebrow, title, text, icon }: { eyebrow: string; title: string; text: string; icon: SymbolViewProps['name'] }) {
  return <View style={styles.hero}><View pointerEvents="none" style={styles.heroGlow} /><View style={styles.heroIcon}><Icon name={icon} size={25} color={colors.gold} /></View><View style={styles.heroCopy}><Eyebrow>{eyebrow}</Eyebrow><Title size="medium">{title}</Title><Body>{text}</Body></View></View>;
}

export function AdminCardHeader({ title, detail, icon, count }: { title: string; detail?: string; icon: SymbolViewProps['name']; count?: number | string }) {
  return <View style={styles.cardHeader}><View style={styles.cardIcon}><Icon name={icon} size={19} color={colors.gold} /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>{title}</Text>{detail ? <Text style={styles.cardDetail}>{detail}</Text> : null}</View>{count !== undefined ? <View style={styles.count}><Text style={styles.countText}>{count}</Text></View> : null}</View>;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  back: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: spacing.sm },
  backText: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 12 },
  hero: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.xl, backgroundColor: colors.ink850, padding: spacing.lg },
  heroGlow: { position: 'absolute', right: -42, top: -52, width: 145, height: 145, borderRadius: 73, backgroundColor: colors.goldSoft },
  heroIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: radius.md, backgroundColor: colors.goldSoft },
  heroCopy: { flex: 1, gap: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, backgroundColor: colors.goldSoft },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.chalk, fontFamily: fonts.display, fontSize: 23, lineHeight: 26, textTransform: 'uppercase' },
  cardDetail: { marginTop: 2, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  count: { minWidth: 30, minHeight: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.pill, backgroundColor: colors.goldSoft, paddingHorizontal: 8 },
  countText: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 9 },
});
