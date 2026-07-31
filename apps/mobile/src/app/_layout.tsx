import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/theme';

const thursdayLeagueTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.gold,
    background: colors.ink900,
    card: colors.ink850,
    text: colors.chalk,
    border: colors.goldMuted,
    notification: colors.gold,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={thursdayLeagueTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink900 } }} />
    </ThemeProvider>
  );
}
