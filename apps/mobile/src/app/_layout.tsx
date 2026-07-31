import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { DarkTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/theme';
import { AuthProvider } from '@/providers/AuthProvider';
import { LeagueProvider } from '@/providers/LeagueProvider';
import { NativeServicesProvider } from '@/providers/NativeServicesProvider';

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
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider value={thursdayLeagueTheme}>
      <StatusBar style="light" />
      <AuthProvider>
        <LeagueProvider>
          <NativeServicesProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink900 }, animation: reduceMotion ? 'none' : 'fade' }} />
          </NativeServicesProvider>
        </LeagueProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <SafeAreaView style={errorStyles.safe}>
    <View accessibilityRole="alert" style={errorStyles.card}>
      <Text style={errorStyles.eyebrow}>THURSDAY LEAGUE</Text>
      <Text style={errorStyles.title}>Something went wrong</Text>
      <Text style={errorStyles.body}>Your account data is safe. Try opening this screen again.</Text>
      {__DEV__ ? <Text selectable style={errorStyles.debug}>{error.message}</Text> : null}
      <Pressable accessibilityRole="button" onPress={retry} style={errorStyles.button}><Text style={errorStyles.buttonText}>Try again</Text></Pressable>
    </View>
  </SafeAreaView>;
}

const errorStyles = StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', backgroundColor: colors.ink900, padding: 24 },
  card: { gap: 14, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: 22, backgroundColor: colors.ink850, padding: 24 },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.chalk, fontSize: 32, lineHeight: 36, fontWeight: '900' },
  body: { color: colors.chalkMuted, fontSize: 15, lineHeight: 22 },
  debug: { color: colors.chalkMuted, fontSize: 11, lineHeight: 16 },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.gold, paddingHorizontal: 20 },
  buttonText: { color: colors.ink900, fontSize: 15, fontWeight: '900' },
});
