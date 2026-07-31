import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Body, Button, Card, Eyebrow, Field, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { friendlyMobileError } from '@/lib/api';
import { requireMobileEnvironment } from '@/lib/env';
import { getPendingInvite, saveAuthNotice } from '@/lib/onboarding';
import { useAuth } from '@/providers/AuthProvider';

export default function AccountScreen() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
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

  async function openPublicPage(path: string) {
    try {
      await WebBrowser.openBrowserAsync(`${requireMobileEnvironment().webUrl.replace(/\/$/, '')}${path}`);
    } catch (error) {
      setMessage(friendlyMobileError(error, 'That page could not be opened.'));
    }
  }

  return (
    <Screen>
      <Eyebrow>THURSDAY LEAGUE</Eyebrow>
      <Title>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</Title>
      <Body>{mode === 'login' ? 'Continue your matchweek with your username or verified email.' : 'Enter once with a username, private email and password. You can use the app immediately.'}</Body>
      <Card>
        <View style={styles.tabs}>
          {(['login', 'signup'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: item === mode }} onPress={() => { setMode(item); setMessage(null); setIdentity(''); }} style={[styles.tab, item === mode && styles.tabActive]}><Text style={[styles.tabText, item === mode && styles.tabTextActive]}>{item === 'login' ? 'Log in' : 'Sign up'}</Text></Pressable>)}
        </View>
        <Field label={mode === 'login' ? 'Username or email' : 'Username'} value={identity} onChangeText={setIdentity} autoCapitalize="none" autoCorrect={false} autoComplete="username" placeholder={mode === 'login' ? 'Username or verified email' : 'Choose a username'} />
        {mode === 'signup' ? <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@example.com" hint="Kept private. Verification enables email login and password recovery." /> : null}
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" />
        {mode === 'signup' ? <Field label="Confirm password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoComplete="new-password" placeholder="Password again" /> : null}
        {message ? <Message tone="error">{message}</Message> : null}
        {mode === 'signup' ? <Text style={styles.legalCopy}>By creating an account, you agree to the Terms of Use and acknowledge the Privacy Policy.</Text> : null}
        <Button onPress={submit} disabled={busy}>{busy ? 'Working...' : mode === 'login' ? 'Log in' : 'Create account'}</Button>
        {mode === 'login' ? <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')}><Text style={styles.link}>Forgot password?</Text></Pressable> : <Text style={styles.helper}>We send verification separately. There is no second password setup.</Text>}
        <View accessibilityRole="none" style={styles.legalLinks}>
          <Pressable accessibilityRole="link" onPress={() => void openPublicPage('/privacy')}><Text style={styles.legalLink}>Privacy</Text></Pressable>
          <Text style={styles.legalDivider}>•</Text>
          <Pressable accessibilityRole="link" onPress={() => void openPublicPage('/terms')}><Text style={styles.legalLink}>Terms</Text></Pressable>
          <Text style={styles.legalDivider}>•</Text>
          <Pressable accessibilityRole="link" onPress={() => void openPublicPage('/support')}><Text style={styles.legalLink}>Support</Text></Pressable>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldMuted, backgroundColor: colors.ink900 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.ink800 },
  tabText: { color: colors.chalkMuted, fontWeight: '800' },
  tabTextActive: { color: colors.gold },
  link: { color: colors.gold, fontSize: 14, fontWeight: '800', textAlign: 'center', paddingVertical: spacing.sm },
  helper: { color: colors.chalkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  legalCopy: { color: colors.chalkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.xs },
  legalLink: { color: colors.gold, fontSize: 12, fontWeight: '800', paddingVertical: spacing.sm },
  legalDivider: { color: colors.goldMuted, fontSize: 12 },
});
