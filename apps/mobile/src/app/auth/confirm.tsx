import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { EmailOtpType } from '@supabase/supabase-js';

import { Body, Button, Card, Eyebrow, Field, Loading, Message, Screen, Title } from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

type State = 'working' | 'verified' | 'recovery' | 'error';

export default function AuthConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ flow?: string; code?: string; token_hash?: string; type?: string }>();
  const currentUrl = Linking.useURL();
  const { refreshProfile } = useAuth();
  const [state, setState] = useState<State>('working');
  const [message, setMessage] = useState('Confirming your secure link...');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function confirm() {
      const supabase = getSupabaseClient();
      const url = currentUrl ? new URL(currentUrl) : null;
      const fragment = new URLSearchParams(url?.hash.replace(/^#/, '') || '');
      const code = typeof params.code === 'string' ? params.code : url?.searchParams.get('code');
      const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : url?.searchParams.get('token_hash');
      const otpType = (typeof params.type === 'string' ? params.type : url?.searchParams.get('type')) as EmailOtpType | null;
      const accessToken = fragment.get('access_token');
      const refreshToken = fragment.get('refresh_token');
      let error: { message: string } | null = null;

      if (code) {
        ({ error } = await supabase.auth.exchangeCodeForSession(code));
      } else if (tokenHash && otpType) {
        ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType }));
      } else if (accessToken && refreshToken) {
        ({ error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }));
      } else {
        const existing = await supabase.auth.getSession();
        error = existing.error;
        if (!existing.data.session) error = { message: 'This secure link is invalid or has expired.' };
      }

      if (!mounted) return;
      if (error) {
        setState('error');
        setMessage('This secure link is invalid or has expired. Request a new one and try again.');
        return;
      }
      const flow = typeof params.flow === 'string' ? params.flow : url?.searchParams.get('flow');
      if (flow === 'recover-password' || otpType === 'recovery' || fragment.get('type') === 'recovery') {
        setState('recovery');
        setMessage('Choose a new password for your account.');
      } else {
        await refreshProfile();
        setState('verified');
        setMessage('Your email is verified. You can now use it to sign in and recover your password.');
      }
    }
    void confirm();
    return () => { mounted = false; };
  }, [currentUrl, params.code, params.flow, params.token_hash, params.type, refreshProfile]);

  async function updatePassword() {
    if (password.length < 8) return setMessage('Password needs at least 8 characters.');
    if (password !== confirmation) return setMessage('Passwords do not match.');
    setBusy(true);
    const result = await getSupabaseClient().auth.updateUser({ password });
    setBusy(false);
    if (result.error) {
      setMessage('Your password could not be updated. Request a new recovery link and try again.');
      return;
    }
    setState('verified');
    setMessage('Password updated. Your username or verified email will both work at login.');
  }

  if (state === 'working') return <Loading label="Confirming your secure link..." />;
  return <Screen><Eyebrow>{state === 'recovery' ? 'SECURE RECOVERY' : 'ACCOUNT SECURITY'}</Eyebrow><Title>{state === 'recovery' ? 'Choose a new password.' : state === 'verified' ? 'You are all set.' : 'Link unavailable.'}</Title><Body>{message}</Body><Card>{state === 'recovery' ? <><Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" /><Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" /><Button onPress={updatePassword} disabled={busy}>{busy ? 'Updating...' : 'Update password'}</Button></> : <><Message tone={state === 'error' ? 'error' : 'success'}>{message}</Message><Button onPress={() => router.replace('/')}>Continue</Button></>}</Card></Screen>;
}
