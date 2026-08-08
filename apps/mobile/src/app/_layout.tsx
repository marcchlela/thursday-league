import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { DarkTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { Inter_900Black } from '@expo-google-fonts/inter/900Black';
import { Oswald_600SemiBold } from '@expo-google-fonts/oswald/600SemiBold';
import { Oswald_700Bold } from '@expo-google-fonts/oswald/700Bold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';

import { colors, fonts } from '@/constants/theme';
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

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black, Oswald_600SemiBold, Oswald_700Bold, JetBrainsMono_500Medium, JetBrainsMono_700Bold });
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <ThemeProvider value={thursdayLeagueTheme}>
      <StatusBar style="light" />
      <AuthProvider>
        <LeagueProvider>
          <NativeServicesProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink900 }, animation: reduceMotion ? 'none' : 'fade_from_bottom' }} />
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
  eyebrow: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 36, lineHeight: 40, textTransform: 'uppercase' },
  body: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  debug: { color: colors.chalkMuted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.gold, paddingHorizontal: 20 },
  buttonText: { color: colors.ink900, fontFamily: fonts.sansExtraBold, fontSize: 15 },
});
