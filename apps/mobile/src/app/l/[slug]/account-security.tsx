import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Field, Loading, Message, Screen, Title } from '@/components/ui';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { apiRequest, friendlyMobileError } from '@/lib/api';
import { isInternalLoginEmail } from '@/lib/auth';
import { requireMobileEnvironment } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export default function AccountSecurityScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, user, profile, signOut, refreshProfile } = useAuth();
  const { league, loading, switching } = useScopedLeague(slug);
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('error');

  if (loading || switching || !league || !user || !profile || !session) {
    return <Loading label="Loading account security..." />;
  }

  const username = profile.username;
  const verifiedEmail = !isInternalLoginEmail(user.email) ? user.email : null;

  async function verifyEmail() {
    if (!email.includes('@')) return setMessage('Enter a valid email address.');
    setBusy('email');
    const result = await getSupabaseClient().auth.updateUser(
      { email: email.trim().toLowerCase() },
      { emailRedirectTo: 'thursdayleague://auth/confirm?flow=verify-email' },
    );
    setBusy(null);
    if (result.error) {
      setTone('error');
      setMessage('The verification email could not be sent. Wait a moment and try again.');
      return;
    }
    setTone('success');
    setMessage(`Verification sent to ${email.trim().toLowerCase()}. Your username login keeps working.`);
    setEmail('');
    await refreshProfile();
  }

  async function changePassword() {
    if (!currentPassword) return setMessage('Enter your current password.');
    if (password.length < 8) return setMessage('New password needs at least 8 characters.');
    if (password !== confirmation) return setMessage('Passwords do not match.');
    setBusy('password');
    try {
      const login = await apiRequest<{ session: { access_token: string; refresh_token: string } }>({
        path: '/api/auth/session',
        body: { identity: username, password: currentPassword },
      });
      const supabase = getSupabaseClient();
      const installed = await supabase.auth.setSession(login.session);
      if (installed.error) throw installed.error;
      const updated = await supabase.auth.updateUser({ password });
      if (updated.error) throw updated.error;
      setCurrentPassword('');
      setPassword('');
      setConfirmation('');
      setTone('success');
      setMessage('Password updated.');
    } catch (error) {
      setTone('error');
      setMessage(friendlyMobileError(error, 'Your password could not be updated. Check the current password.'));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    if (!session || deleteConfirmation !== 'DELETE' || busy) return;
    setBusy('delete');
    try {
      await apiRequest<{ success: boolean }>({
        path: '/api/account/delete',
        token: session.access_token,
        body: { confirmation: deleteConfirmation },
        timeoutMs: 20000,
      });
      await signOut();
      router.replace('/account');
    } catch (error) {
      setTone('error');
      setMessage(friendlyMobileError(error, 'Your account could not be deleted. Please try again.'));
      setBusy(null);
    }
  }

  async function openPublicPage(path: string) {
    try {
      const url = `${requireMobileEnvironment().webUrl.replace(/\/$/, '')}${path}`;
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      setTone('error');
      setMessage(friendlyMobileError(error, 'That page could not be opened.'));
    }
  }

  return (
    <Screen>
      <LeagueHeader league={league} />
      <Button variant="secondary" onPress={() => router.back()}>← Profile</Button>
      <Eyebrow>ACCOUNT SECURITY</Eyebrow>
      <Title>Recovery & password.</Title>
      <Body>Your username stays your public identity. A verified private email adds recovery and optional email sign-in.</Body>
      {message ? <Message tone={tone}>{message}</Message> : null}

      <Card>
        <Eyebrow>{verifiedEmail ? 'VERIFIED EMAIL' : user.new_email ? 'VERIFICATION PENDING' : 'RECOVERY EMAIL'}</Eyebrow>
        <Body muted={false}>{verifiedEmail || user.new_email || 'No verified recovery email yet'}</Body>
        <Field
          label={verifiedEmail ? 'Change recovery email' : 'Email address'}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Button onPress={verifyEmail} disabled={!!busy}>{busy === 'email' ? 'Sending...' : 'Send verification'}</Button>
      </Card>

      <Card>
        <Eyebrow>UPDATE PASSWORD</Eyebrow>
        <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" />
        <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        <Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" />
        <Button onPress={changePassword} disabled={!!busy}>{busy === 'password' ? 'Updating...' : 'Update password'}</Button>
      </Card>

      <Card>
        <Eyebrow>HELP & LEGAL</Eyebrow>
        <Button variant="secondary" onPress={() => void openPublicPage('/support')}>Support</Button>
        <Button variant="secondary" onPress={() => void openPublicPage('/privacy')}>Privacy policy</Button>
        <Button variant="secondary" onPress={() => void openPublicPage('/terms')}>Terms of use</Button>
      </Card>

      <Card>
        <Eyebrow>DELETE ACCOUNT</Eyebrow>
        <Body>Permanently remove your login, email, profile photo, settings, and notification devices. Shared league history remains anonymous.</Body>
        <Body>If you own an active league, transfer ownership or archive it first.</Body>
        <Field
          label="Type DELETE to confirm"
          value={deleteConfirmation}
          onChangeText={setDeleteConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE"
        />
        <Button variant="danger" onPress={deleteAccount} disabled={deleteConfirmation !== 'DELETE' || !!busy}>
          {busy === 'delete' ? 'Deleting account...' : 'Delete account forever'}
        </Button>
      </Card>
    </Screen>
  );
}
