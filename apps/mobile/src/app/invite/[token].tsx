import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors } from '@/constants/theme';
import { friendlyMobileError } from '@/lib/api';
import { clearPendingInvite, savePendingInvite } from '@/lib/onboarding';
import { getSupabaseClient } from '@/lib/supabase';
import type { LeaguePreview } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useLeagues } from '@/providers/LeagueProvider';

export default function InviteScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const { refreshLeagues } = useLeagues();
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void getSupabaseClient().rpc('preview_league_invite_link', { submitted_token: token }).then(result => {
      setLoading(false);
      if (result.error) setMessage('This invitation is invalid, expired or already used.');
      else setPreview(result.data as LeaguePreview);
    });
  }, [token]);

  async function continueToAccount() {
    await savePendingInvite(token);
    router.push('/account');
  }

  async function accept() {
    if (!session || !preview) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await getSupabaseClient().rpc('accept_league_invite_link', { submitted_token: token });
      if (result.error) throw result.error;
      await clearPendingInvite();
      await refreshLeagues(preview.id);
      const accepted = result.data as { slug: string };
      router.replace({ pathname: '/l/[slug]', params: { slug: accepted.slug || preview.slug } });
    } catch (error) {
      setMessage(friendlyMobileError(error, 'This invitation could not be accepted.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Opening your invitation..." />;
  return <Screen><Eyebrow>LEAGUE INVITATION</Eyebrow><Title>{preview ? `You are invited to ${preview.name}.` : 'Invitation unavailable.'}</Title>{preview ? <><Body>Review the league before joining. Invite links join immediately after you accept.</Body><Card><Text style={styles.name}>{preview.name}</Text><Text style={styles.details}>{preview.member_count} members</Text><Text style={styles.details}>{preview.fantasy_enabled ? 'Fantasy included' : 'Fantasy off'} · {preview.betting_enabled ? 'Virtual betting included' : 'Betting off'}</Text>{session ? <Button onPress={accept} disabled={busy}>{busy ? 'Joining...' : preview.already_member ? 'Open league' : 'Accept invitation'}</Button> : <Button onPress={continueToAccount}>Log in or create account</Button>}<Button variant="secondary" onPress={() => router.replace('/')}>Not now</Button></Card></> : null}{message ? <Message tone="error">{message}</Message> : null}</Screen>;
}

const styles = StyleSheet.create({ name: { color: colors.chalk, fontSize: 24, fontWeight: '900' }, details: { color: colors.chalkMuted, fontSize: 13, lineHeight: 19 } });
