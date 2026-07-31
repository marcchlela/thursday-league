import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/constants/theme';
import { getMobileEnvironmentStatus } from '@/lib/env';

export default function HomeScreen() {
  const environment = getMobileEnvironmentStatus();

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.eyebrowRow}>
          <View style={styles.liveDot} />
          <Text style={styles.eyebrow}>NATIVE FOUNDATION</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.wordmark}>THURSDAY</Text>
          <Text style={styles.wordmarkAccent}>LEAGUE</Text>
          <Text style={styles.subtitle}>The mobile matchweek starts here.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>PHASE 1</Text>
          <Text style={styles.cardTitle}>Mobile shell ready</Text>
          <Text style={styles.cardCopy}>
            Expo Router, native theming, build profiles and the Supabase client foundation are isolated from the production website.
          </Text>

          <View style={styles.divider} />

          <StatusRow label="Expo SDK" value="57" ready />
          <StatusRow label="iOS + Android" value="Configured" ready />
          <StatusRow
            label="Local environment"
            value={environment.configured ? 'Configured' : `${environment.missing.length} values pending`}
            ready={environment.configured}
          />
        </View>

        <Text style={styles.footer}>No production data is loaded on this screen.</Text>
      </SafeAreaView>
    </View>
  );
}

function StatusRow({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <View style={styles.statusRow} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.statusIcon, ready ? styles.statusIconReady : styles.statusIconPending]}>
        <Text style={styles.statusIconText}>{ready ? '✓' : '•'}</Text>
      </View>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, !ready && styles.statusValuePending]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink900,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.turf400,
  },
  eyebrow: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  wordmark: {
    color: colors.chalk,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 48,
  },
  wordmarkAccent: {
    color: colors.gold,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 52,
  },
  subtitle: {
    marginTop: spacing.md,
    color: colors.chalkMuted,
    fontSize: 17,
    lineHeight: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.goldMuted,
    borderRadius: radius.lg,
    backgroundColor: colors.ink850,
    padding: spacing.lg,
  },
  cardKicker: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  cardTitle: {
    marginTop: spacing.sm,
    color: colors.chalk,
    fontSize: 24,
    fontWeight: '800',
  },
  cardCopy: {
    marginTop: spacing.sm,
    color: colors.chalkMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
    backgroundColor: colors.goldMuted,
    opacity: 0.55,
  },
  statusRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  statusIconReady: {
    backgroundColor: colors.turf900,
    borderWidth: 1,
    borderColor: colors.turf400,
  },
  statusIconPending: {
    backgroundColor: colors.ink800,
    borderWidth: 1,
    borderColor: colors.goldMuted,
  },
  statusIconText: {
    color: colors.chalk,
    fontSize: 12,
    fontWeight: '900',
  },
  statusLabel: {
    flex: 1,
    color: colors.chalkMuted,
    fontSize: 13,
  },
  statusValue: {
    color: colors.turf400,
    fontSize: 12,
    fontWeight: '800',
  },
  statusValuePending: {
    color: colors.gold,
  },
  footer: {
    marginTop: spacing.md,
    color: colors.chalkMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
