import { useState } from 'react';
import { useRouter } from 'expo-router';

import { Body, Button, Card, Eyebrow, Field, Message, Screen, Title } from '@/components/ui';
import { friendlyMobileError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestRecovery } = useAuth();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      setMessage(await requestRecovery(username.trim()));
    } catch (requestError) {
      setError(true);
      setMessage(friendlyMobileError(requestError, 'Recovery is temporarily unavailable.'));
    } finally {
      setBusy(false);
    }
  }

  return <Screen><Eyebrow>ACCOUNT RECOVERY</Eyebrow><Title>Reset your password.</Title><Body>Enter your username. If it has a verified recovery email, we will send a secure reset link.</Body><Card><Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" placeholder="Your username" />{message ? <Message tone={error ? 'error' : 'success'}>{message}</Message> : null}<Button onPress={submit} disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</Button><Button variant="secondary" onPress={() => router.back()}>Back to login</Button></Card></Screen>;
}
