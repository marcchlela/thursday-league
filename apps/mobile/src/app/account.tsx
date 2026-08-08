import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Body, Button, Card, Eyebrow, Field, Message, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { friendlyMobileError } from '@/lib/api';
import { getPendingInvite, saveAuthNotice } from '@/lib/onboarding';
import { useAuth } from '@/providers/AuthProvider';

export default function AccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(params.mode === 'signup' ? 'signup' : 'login');
  const [identity, setIdentity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function finish() {
    const invite = await getPendingInvite();
    router.replace(invite ? { pathname: '/invite/[token]', params: { token: invite } } : '/');
  }

  async function submit() {
    setMessage(null);
    if (mode === 'login' && identity.trim().length < 2) return setMessage('Enter your username or email.');
    if (mode === 'signup' && !/^[a-z0-9_]{2,32}$/.test(identity.trim().toLowerCase())) return setMessage('Use 2-32 letters, numbers or underscores for your username.');
    if (mode === 'signup' && !email.includes('@')) return setMessage('Enter a valid email address.');
    if (password.length < 8) return setMessage('Password needs at least 8 characters.');
    if (mode === 'signup' && password !== confirmation) return setMessage('Passwords do not match.');

    setBusy(true);
    try {
      if (mode === 'signup') {
        const result = await signUp(identity.trim().toLowerCase(), email.trim(), password);
        await saveAuthNotice(result.emailVerificationSent
          ? 'Account created. Check your email when convenient to verify recovery.'
          : result.warning || 'Account created. Add a verified recovery email from Settings.');
      } else {
        await signIn(identity.trim(), password);
      }
      await finish();
    } catch (error) {
      setMessage(friendlyMobileError(error, 'Account access could not be completed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.brand}><Image source={require('../../assets/images/splash-icon.png')} resizeMode="contain" style={styles.logo} /><View><Text style={styles.brandEyebrow}>WEEKLY FIVE-A-SIDE</Text><Text style={styles.brandName}>THURSDAY LEAGUE</Text></View></View>
      <View style={styles.hero}><Text style={styles.heroTitle}>YOUR MATCHWEEK.{"\n"}<Text style={styles.heroAccent}>ONE PLACE.</Text></Text><Body>Lineups, Fantasy, virtual betting, results and league history built around your weekly game.</Body></View>
      <Card>
        <View style={styles.tabs}>
          {(['login', 'signup'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: item === mode }} onPress={() => { setMode(item); setMessage(null); setIdentity(''); }} style={[styles.tab, item === mode && styles.tabActive]}><Text style={[styles.tabText, item === mode && styles.tabTextActive]}>{item === 'login' ? 'Log in' : 'Sign up'}</Text></Pressable>)}
        </View>
        <View style={styles.formHeading}><View><Eyebrow>LEAGUE ACCESS</Eyebrow><Title size="medium">{mode === 'login' ? 'Welcome back' : 'Create account'}</Title><Body>{mode === 'login' ? 'Sign in to continue your matchweek.' : 'One account for every league you join.'}</Body></View></View>
        <Field label={mode === 'login' ? 'Username or email' : 'Username'} value={identity} onChangeText={setIdentity} autoCapitalize="none" autoCorrect={false} autoComplete="username" placeholder={mode === 'login' ? 'Username or verified email' : 'Choose a username'} />
        {mode === 'signup' ? <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@example.com" hint="Kept private. Verification enables email login and password recovery." /> : null}
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" />
        {mode === 'signup' ? <Field label="Confirm password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoComplete="new-password" placeholder="Password again" /> : null}
        {message ? <Message tone="error">{message}</Message> : null}
        {mode === 'signup' ? <Text style={styles.legalCopy}>By creating an account, you agree to the Terms of Use and acknowledge the Privacy Policy.</Text> : null}
        <Button onPress={submit} disabled={busy}>{busy ? 'Working...' : mode === 'login' ? 'Enter Thursday League' : 'Create account'}</Button>
        {mode === 'login' ? <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')}><Text style={styles.link}>Forgot password?</Text></Pressable> : <Text style={styles.helper}>We send verification separately. There is no second password setup.</Text>}
        <View accessibilityRole="none" style={styles.legalLinks}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/legal/privacy')}><Text style={styles.legalLink}>Privacy</Text></Pressable>
          <Text style={styles.legalDivider}>•</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/legal/terms')}><Text style={styles.legalLink}>Terms</Text></Pressable>
          <Text style={styles.legalDivider}>•</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/legal/support')}><Text style={styles.legalLink}>Support</Text></Pressable>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  logo: { width: 64, height: 64 },
  brandEyebrow: { color: 'rgba(218,165,32,0.68)', fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.8 },
  brandName: { marginTop: 3, color: colors.chalk, fontFamily: fonts.display, fontSize: 24, lineHeight: 25 },
  hero: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  heroTitle: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 43, lineHeight: 42, letterSpacing: -0.6, textAlign: 'center' },
  heroAccent: { color: colors.gold },
  formHeading: { marginVertical: spacing.xs },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(218,165,32,0.2)', backgroundColor: 'rgba(0,0,0,0.2)' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.goldSoft },
  tabText: { color: colors.chalkMuted, fontFamily: fonts.sansBold },
  tabTextActive: { color: colors.gold },
  link: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 13, textAlign: 'center', paddingVertical: spacing.sm },
  helper: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  legalCopy: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.xs },
  legalLink: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 11, paddingVertical: spacing.sm },
  legalDivider: { color: colors.goldMuted, fontFamily: fonts.sans, fontSize: 12 },
});
