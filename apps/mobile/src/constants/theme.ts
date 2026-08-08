import { Platform } from 'react-native';

// Native mirrors the web design tokens in app/globals.css. Keep both files in
// sync so the installed app and the website remain one visual product.
export const colors = {
  ink900: '#11110F',
  ink900Raised: '#141411',
  ink850: '#171714',
  ink800: '#1E1D19',
  black: '#000000',
  chalk: '#F5F2E8',
  chalk85: '#D0CEC5',
  chalk72: '#B0AEA7',
  chalkMuted: '#929087',
  chalk45: '#74726E',
  chalk30: '#55544F',
  gold: '#DAA520',
  goldBright: '#F7B733',
  goldInk: '#171814',
  goldBorder: 'rgba(218,165,32,0.25)',
  goldBorderStrong: 'rgba(218,165,32,0.38)',
  goldSoft: 'rgba(218,165,32,0.08)',
  goldMuted: '#6C531B',
  turf50: '#EFFFF1',
  turf100: '#D7FADD',
  turf400: '#31B94E',
  turf500: '#148A32',
  turf700: '#0B5A23',
  turf900: '#063916',
  perimeter400: '#28A8FF',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.09)',
  successSoft: 'rgba(49,185,78,0.08)',
  transparent: 'transparent',
} as const;

export const fonts = {
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  sansExtraBold: 'Inter_800ExtraBold',
  sansBlack: 'Inter_900Black',
  display: 'Oswald_600SemiBold',
  displayBold: 'Oswald_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 21,
  xl: 26,
  pill: 999,
} as const;

export const shadows = {
  card: Platform.select({
    ios: { shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 9 } },
    android: { elevation: 3 },
    default: {},
  }),
  floating: Platform.select({
    ios: { shadowColor: '#000000', shadowOpacity: 0.38, shadowRadius: 28, shadowOffset: { width: 0, height: 16 } },
    android: { elevation: 12 },
    default: {},
  }),
} as const;
