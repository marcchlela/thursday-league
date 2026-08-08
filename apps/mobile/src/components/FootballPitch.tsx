import type { PropsWithChildren, ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';
import type { PlayerPosition, TeamCode } from '@/lib/types';

const goalkeeperJersey = require('../../../../public/fantasy/goalkeeper-jersey.webp');
const teamAJersey = require('../../../../public/fantasy/outfield-jersey.webp');
const teamBJersey = require('../../../../public/fantasy/team-b-outfield-jersey.webp');

export type PitchSlot = { x: number; y: number };

export const fantasyGoalkeeperSlots: PitchSlot[] = [
  { x: 25, y: 27 }, { x: 75, y: 27 }, { x: 29, y: 56 }, { x: 71, y: 56 }, { x: 50, y: 84 },
];
export const fantasyFlexibleSlots: PitchSlot[] = [
  { x: 50, y: 18 }, { x: 23, y: 43 }, { x: 77, y: 43 }, { x: 31, y: 70 }, { x: 69, y: 70 },
];

export function FootballPitch({ children, tall = false, label }: PropsWithChildren<{ tall?: boolean; label?: string }>) {
  return (
    <View accessibilityLabel={label} style={[styles.pitch, tall ? styles.pitchTall : styles.pitchFantasy]}>
      <View pointerEvents="none" style={styles.stripes}>
        {Array.from({ length: 10 }).map((_, index) => <View key={index} style={[styles.stripe, index % 2 === 0 && styles.stripeDark]} />)}
      </View>
      <View pointerEvents="none" style={styles.touchline} />
      <View pointerEvents="none" style={styles.halfway} />
      <View pointerEvents="none" style={styles.centerCircle} />
      <View pointerEvents="none" style={styles.centerSpot} />
      <View pointerEvents="none" style={[styles.penaltyArea, styles.penaltyTop]} />
      <View pointerEvents="none" style={[styles.penaltyArea, styles.penaltyBottom]} />
      {children}
    </View>
  );
}

export function PitchPlayer({
  x,
  y,
  name,
  role,
  team = 'A',
  captain = false,
  empty = false,
  selected = false,
  onPress,
  compact = false,
  overlay,
}: {
  x: number;
  y: number;
  name: string;
  role: PlayerPosition;
  team?: TeamCode;
  captain?: boolean;
  empty?: boolean;
  selected?: boolean;
  onPress?: () => void;
  compact?: boolean;
  overlay?: ReactNode;
}) {
  const jersey = role === 'goalkeeper' ? goalkeeperJersey : team === 'A' ? teamAJersey : teamBJersey;
  const size = compact ? 62 : 82;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={name}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.player,
        { left: `${x}%`, top: `${y}%`, width: compact ? 84 : 104, marginLeft: compact ? -42 : -52, marginTop: compact ? -44 : -58 },
        pressed && styles.playerPressed,
      ]}
    >
      <View style={[styles.jerseyWrap, { width: size, height: size }]}> 
        <Image source={jersey} resizeMode="contain" style={[styles.jersey, empty && styles.jerseyEmpty]} />
        {empty ? <View style={styles.plus}><Text style={styles.plusText}>+</Text></View> : null}
        {captain ? <View style={styles.captain}><Text style={styles.captainText}>C</Text></View> : null}
        {overlay}
      </View>
      <View style={[styles.namePlate, empty && styles.namePlateEmpty, selected && styles.namePlateSelected]}>
        <Text numberOfLines={1} style={[styles.playerName, empty && styles.playerNameEmpty]}>{name}</Text>
      </View>
    </Pressable>
  );
}

const line = 'rgba(239,255,237,0.45)';
const styles = StyleSheet.create({
  pitch: { position: 'relative', width: '100%', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(218,165,32,0.4)', borderRadius: 27, backgroundColor: '#0B3E22' },
  pitchFantasy: { aspectRatio: 4 / 5 },
  pitchTall: { aspectRatio: 3 / 5, minHeight: 600 },
  stripes: { ...StyleSheet.absoluteFill, flexDirection: 'column' },
  stripe: { flex: 1, backgroundColor: 'rgba(255,255,255,0.025)' },
  stripeDark: { backgroundColor: 'rgba(0,0,0,0.025)' },
  touchline: { position: 'absolute', inset: 12, borderWidth: 1, borderColor: line, borderRadius: 20 },
  halfway: { position: 'absolute', left: 12, right: 12, top: '50%', borderTopWidth: 1, borderTopColor: line },
  centerCircle: { position: 'absolute', left: '50%', top: '50%', width: 96, height: 96, marginLeft: -48, marginTop: -48, borderWidth: 1, borderColor: line, borderRadius: 48 },
  centerSpot: { position: 'absolute', left: '50%', top: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: 3, backgroundColor: 'rgba(239,255,237,0.6)' },
  penaltyArea: { position: 'absolute', left: '50%', width: 144, height: 66, marginLeft: -72, borderColor: line },
  penaltyTop: { top: 12, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  penaltyBottom: { bottom: 12, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: 1, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  player: { position: 'absolute', zIndex: 5, alignItems: 'center' },
  playerPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  jerseyWrap: { position: 'relative' },
  jersey: { width: '100%', height: '100%' },
  jerseyEmpty: { opacity: 0.42 },
  plus: { position: 'absolute', left: '50%', top: '50%', width: 28, height: 28, marginLeft: -14, marginTop: -14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,255,237,0.25)', borderRadius: 14, backgroundColor: 'rgba(17,17,15,0.82)' },
  plusText: { color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 18, lineHeight: 21 },
  captain: { position: 'absolute', right: -1, top: 1, width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0B3E22', borderRadius: 14, backgroundColor: colors.gold },
  captainText: { color: colors.goldInk, fontFamily: fonts.sansBlack, fontSize: 11 },
  namePlate: { maxWidth: '100%', marginTop: -7, borderWidth: 1, borderColor: 'rgba(239,255,237,0.1)', borderRadius: 8, backgroundColor: 'rgba(17,17,15,0.92)', paddingHorizontal: 7, paddingVertical: 4 },
  namePlateEmpty: { borderStyle: 'dashed', borderColor: 'rgba(239,255,237,0.16)', backgroundColor: 'rgba(0,0,0,0.35)' },
  namePlateSelected: { borderColor: colors.goldBorderStrong },
  playerName: { color: '#EFFFF1', fontFamily: fonts.sansBold, fontSize: 10, textAlign: 'center' },
  playerNameEmpty: { color: 'rgba(239,255,237,0.58)' },
});
