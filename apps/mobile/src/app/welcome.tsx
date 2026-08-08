import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Button, Eyebrow, Icon, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { completeIntro } from '@/lib/onboarding';

const logo = require('../../assets/images/splash-icon.png');

const slides = [
  {
    eyebrow: 'YOUR FOOTBALL, ORGANIZED',
    title: 'Your league',
    accent: 'lives here.',
    accentColor: colors.gold,
    body: 'Plan matches, publish lineups and keep every result and player stat together.',
    image: require('../../assets/images/tilo-matchday-ready.png'),
    features: [
      { label: 'Matches', icon: { ios: 'calendar', android: 'calendar_month' } as const },
      { label: 'Stats', icon: { ios: 'chart.bar.fill', android: 'bar_chart' } as const },
      { label: 'History', icon: { ios: 'clock.arrow.circlepath', android: 'history' } as const },
    ],
  },
  {
    eyebrow: 'MORE THAN A SCORELINE',
    title: 'Turn form into',
    accent: 'competition.',
    accentColor: colors.turf400,
    body: 'Pick a Fantasy five and predict results with virtual coins, all powered by your real matches.',
    image: null,
    features: [
      { label: '5-player team', icon: { ios: 'tshirt.fill', android: 'checkroom' } as const },
      { label: '2x captain', icon: { ios: 'star.fill', android: 'star' } as const },
      { label: 'Virtual coins', icon: { ios: 'circle.hexagongrid.fill', android: 'paid' } as const },
    ],
  },
  {
    eyebrow: 'STAY READY',
    title: 'Keep the league',
    accent: 'in sync.',
    accentColor: colors.gold,
    body: 'Get matchday reminders, lineup updates and deadlines when they are useful.',
    image: require('../../assets/images/tilo-celebration.png'),
    features: [
      { label: 'Matchday', icon: { ios: 'bell.fill', android: 'notifications' } as const },
      { label: 'Lineups', icon: { ios: 'person.3.fill', android: 'groups' } as const },
      { label: 'Results', icon: { ios: 'checkmark.seal.fill', android: 'verified' } as const },
    ],
  },
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = slides[index];

  async function enter(mode: 'login' | 'signup') {
    await completeIntro();
    router.replace({ pathname: '/account', params: { mode } });
  }

  async function skip() {
    await completeIntro();
    router.replace('/account');
  }

  return (
    <Screen scroll={false}>
      <View style={styles.brandRow}>
        <View style={styles.brand}>
          <Image source={logo} resizeMode="contain" style={styles.logo} />
          <View><Text style={styles.brandEyebrow}>WEEKLY FOOTBALL</Text><Text style={styles.brandName}>THURSDAY LEAGUE</Text></View>
        </View>
        {index < slides.length - 1 ? <Pressable accessibilityRole="button" onPress={skip} hitSlop={12} style={styles.skipButton}><Text style={styles.skip}>Skip intro</Text></Pressable> : null}
      </View>

      <View>
        <View style={styles.progress} accessibilityLabel={`Step ${index + 1} of ${slides.length}`}>
          {slides.map((_, itemIndex) => <View key={itemIndex} style={styles.segment}><View style={[styles.segmentFill, itemIndex > index && styles.segmentHidden]} /></View>)}
        </View>
        <Text style={styles.step}>STEP {index + 1} OF {slides.length}</Text>
      </View>

      <View style={styles.slide} accessibilityLiveRegion="polite">
        <View style={styles.visual}>
          {slide.image ? (
            <View style={styles.mascotStage}><View style={styles.innerRing} /><Image source={slide.image} resizeMode="contain" style={styles.mascot} accessibilityLabel="Tilo, the Thursday League mascot" /></View>
          ) : (
            <View style={styles.competitionGrid}>
              <FeaturePanel icon={{ ios: 'tshirt.fill', android: 'checkroom' }} eyebrow="FANTASY" title="Pick your five" tone="green" />
              <FeaturePanel icon={{ ios: 'circle.hexagongrid.fill', android: 'paid' }} eyebrow="PREDICTIONS" title="Back your call" tone="gold" />
            </View>
          )}
        </View>
        <View style={styles.copy}>
          <Eyebrow tone={index === 2 ? 'blue' : 'gold'}>{slide.eyebrow}</Eyebrow>
          <Title size="medium">{slide.title}{'\n'}<Text style={{ color: slide.accentColor }}>{slide.accent}</Text></Title>
          <Body>{slide.body}</Body>
          <View style={styles.features}>{slide.features.map(feature => <View key={feature.label} style={styles.feature}><Icon name={feature.icon} size={17} color={index === 2 ? colors.perimeter400 : colors.gold} /><Text style={styles.featureText}>{feature.label}</Text></View>)}</View>
        </View>
      </View>

      <View style={styles.footer}>
        {index < slides.length - 1 ? (
          <View style={styles.actions}>
            {index > 0 ? <Button variant="ghost" icon={{ ios: 'chevron.left', android: 'chevron_left' }} onPress={() => setIndex(value => value - 1)}>Back</Button> : <View />}
            <Pressable accessibilityRole="button" onPress={() => setIndex(value => value + 1)} style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}><Text style={styles.continueText}>Continue</Text><View style={styles.continueIcon}><Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={18} color={colors.goldInk} /></View></Pressable>
          </View>
        ) : (
          <View style={styles.finalActions}><Button onPress={() => enter('signup')}>Create account</Button><Button variant="secondary" onPress={() => enter('login')}>I already have an account</Button></View>
        )}
      </View>
    </Screen>
  );
}

function FeaturePanel({ icon, eyebrow, title, tone }: { icon: Parameters<typeof Icon>[0]['name']; eyebrow: string; title: string; tone: 'green' | 'gold' }) {
  const color = tone === 'green' ? colors.turf400 : colors.gold;
  return <View style={styles.panel}><View style={[styles.panelIcon, tone === 'green' && styles.panelIconGreen]}><Icon name={icon} size={24} color={color} /></View><Text style={[styles.panelEyebrow, { color }]}>{eyebrow}</Text><Text style={styles.panelTitle}>{title}</Text></View>;
}

const styles = StyleSheet.create({
  brandRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logo: { width: 49, height: 49 },
  brandEyebrow: { color: 'rgba(218,165,32,0.68)', fontFamily: fonts.sansBlack, fontSize: 7, letterSpacing: 1.45 },
  brandName: { marginTop: 2, color: colors.chalk, fontFamily: fonts.display, fontSize: 20, lineHeight: 21 },
  skipButton: { minHeight: 44, justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: 10 },
  skip: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 12 },
  progress: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 5, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: 'rgba(218,165,32,0.12)' },
  segmentFill: { width: '100%', height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  segmentHidden: { width: 0 },
  step: { marginTop: 6, color: colors.chalk45, fontFamily: fonts.sansBold, fontSize: 8, letterSpacing: 1.2, textAlign: 'right' },
  slide: { flex: 1, justifyContent: 'center', gap: spacing.md },
  visual: { minHeight: 205, alignItems: 'center', justifyContent: 'center' },
  mascotStage: { ...shadows.card, width: 204, height: 204, alignItems: 'center', justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.pill, backgroundColor: 'rgba(218,165,32,0.035)' },
  innerRing: { position: 'absolute', inset: 27, borderWidth: 1, borderColor: 'rgba(218,165,32,0.1)', borderRadius: radius.pill },
  mascot: { width: 192, height: 216 },
  competitionGrid: { width: '100%', flexDirection: 'row', gap: spacing.sm },
  panel: { flex: 1, minHeight: 170, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.md },
  panelIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.goldSoft },
  panelIconGreen: { backgroundColor: colors.successSoft },
  panelEyebrow: { marginTop: spacing.lg, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.5 },
  panelTitle: { marginTop: 3, color: colors.chalk, fontFamily: fonts.display, fontSize: 22, textTransform: 'uppercase' },
  copy: { gap: spacing.sm },
  features: { flexDirection: 'row', gap: 6, marginTop: spacing.xs },
  feature: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(218,165,32,0.18)', borderRadius: radius.md, backgroundColor: colors.ink850, paddingHorizontal: 3 },
  featureText: { color: colors.chalkMuted, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 0.65, textAlign: 'center', textTransform: 'uppercase' },
  footer: { borderTopWidth: 1, borderTopColor: 'rgba(218,165,32,0.12)', paddingTop: spacing.md },
  actions: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  continueButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: radius.md, backgroundColor: colors.goldSoft, paddingLeft: spacing.md, paddingRight: 7 },
  continueText: { color: colors.gold, fontFamily: fonts.sansExtraBold, fontSize: 13 },
  continueIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.gold },
  finalActions: { gap: spacing.sm },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
