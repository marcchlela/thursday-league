import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Button, Eyebrow, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { completeIntro } from '@/lib/onboarding';

const slides = [
  {
    eyebrow: 'WELCOME TO THURSDAY LEAGUE',
    title: 'Your matchweek. One place.',
    body: 'Organize the weekly game, follow every result and keep your league history together.',
    image: require('../../assets/images/tilo-matchday-ready.png'),
  },
  {
    eyebrow: 'PLAY EVERY WEEK',
    title: 'Fantasy and virtual bets.',
    body: 'Pick your five, choose a captain and make predictions with league coins - never real money.',
    image: null,
  },
  {
    eyebrow: 'STAY MATCH-READY',
    title: 'The useful updates, on time.',
    body: 'Lineups, deadlines and matchday reminders help everyone arrive ready. You can choose notifications later.',
    image: require('../../assets/images/tilo-celebration.png'),
  },
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = slides[index];

  async function next() {
    if (index < slides.length - 1) {
      setIndex(value => value + 1);
      return;
    }
    await completeIntro();
    router.replace('/account');
  }

  async function skip() {
    await completeIntro();
    router.replace('/account');
  }

  return (
    <Screen scroll={false}>
      <View style={styles.topRow}>
        <View style={styles.progress} accessibilityLabel={`Step ${index + 1} of ${slides.length}`}>
          {slides.map((_, itemIndex) => <View key={itemIndex} style={[styles.segment, itemIndex <= index && styles.segmentActive]} />)}
        </View>
        {index < slides.length - 1 ? <Pressable accessibilityRole="button" onPress={skip} hitSlop={12}><Text style={styles.skip}>Skip</Text></Pressable> : null}
      </View>
      <View style={styles.visual}>
        {slide.image ? <Image source={slide.image} resizeMode="contain" style={styles.mascot} accessibilityLabel="Tilo, the Thursday League mascot" /> : <View style={styles.pitch}><View style={styles.centerLine} /><View style={styles.centerCircle}><Text style={styles.pitchText}>5</Text></View><View style={[styles.coin, styles.coinOne]} /><View style={[styles.coin, styles.coinTwo]} /></View>}
      </View>
      <View style={styles.copy}>
        <Eyebrow>{slide.eyebrow}</Eyebrow>
        <Title>{slide.title}</Title>
        <Body>{slide.body}</Body>
      </View>
      <Button onPress={next}>{index === slides.length - 1 ? 'Get started' : 'Next'}</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progress: { flex: 1, flexDirection: 'row', gap: spacing.sm },
  segment: { flex: 1, height: 3, borderRadius: radius.pill, backgroundColor: colors.goldMuted, opacity: 0.35 },
  segmentActive: { backgroundColor: colors.gold, opacity: 1 },
  skip: { color: colors.chalkMuted, fontSize: 13, fontWeight: '800' },
  visual: { flex: 1, minHeight: 250, alignItems: 'center', justifyContent: 'center' },
  mascot: { width: '92%', height: '92%' },
  pitch: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center', borderRadius: 130, borderWidth: 1, borderColor: colors.goldMuted, backgroundColor: colors.ink850 },
  centerLine: { position: 'absolute', width: 1, height: '100%', backgroundColor: colors.goldMuted },
  centerCircle: { width: 90, height: 90, alignItems: 'center', justifyContent: 'center', borderRadius: 45, borderWidth: 1, borderColor: colors.gold },
  pitchText: { color: colors.gold, fontSize: 48, fontWeight: '900' },
  coin: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gold },
  coinOne: { left: 42, top: 62 },
  coinTwo: { right: 38, bottom: 52 },
  copy: { gap: spacing.md, paddingBottom: spacing.sm },
});
