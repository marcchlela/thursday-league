import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Button, Card, Eyebrow, Field, Message, Screen, Title } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { apiRequest, friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import type { JoinRequest, LeaguePreview } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useLeagues } from '@/providers/LeagueProvider';

export default function LeagueEntryScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { leagues, refreshLeagues } = useLeagues();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      router.replace('/account');
      return;
    }
    void getSupabaseClient().rpc('get_my_league_join_requests').then(result => {
      if (!result.error) setRequests((result.data || []) as JoinRequest[]);
    });
  }, [router, session]);

  async function findLeague() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await getSupabaseClient().rpc('preview_league_by_code', { submitted_code: code.trim().toUpperCase() });
      if (result.error) throw result.error;
      setPreview(result.data as LeaguePreview);
    } catch (error) {
      setPreview(null);
      setMessage(friendlyMobileError(error, 'That league code is not valid.'));
    } finally {
      setBusy(false);
    }
  }

  async function requestToJoin() {
    if (!session || !preview) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiRequest<{ result: { status: string; slug?: string } }>({
        path: '/api/leagues/membership',
        token: session.access_token,
        body: { action: 'request', code: code.trim().toUpperCase() },
      });
      if (response.result.status === 'already_member' && response.result.slug) {
        await refreshLeagues(preview.id);
        router.replace({ pathname: '/l/[slug]', params: { slug: response.result.slug } });
        return;
      }
      setPreview(null);
      setCode('');
      setMessage('Request sent. A league admin will see it in their member approvals.');
      const result = await getSupabaseClient().rpc('get_my_league_join_requests');
      if (!result.error) setRequests((result.data || []) as JoinRequest[]);
    } catch (error) {
      setMessage(friendlyMobileError(error, 'Your request could not be sent.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Eyebrow>YOUR LEAGUES</Eyebrow>
      <Title>Join or create.</Title>
      <Body>Enter a code to request access, or start a new league and invite your group.</Body>
      {leagues.length ? <Button variant="secondary" onPress={() => router.push('/leagues')}>Back to my leagues</Button> : null}
      <Card>
        <Field label="League code" value={code} onChangeText={value => { setCode(value.toUpperCase()); setPreview(null); }} autoCapitalize="characters" autoCorrect={false} placeholder="TL-XXXX-XXXX" />
        <Button onPress={findLeague} disabled={busy || code.trim().length < 8}>{busy ? 'Checking...' : 'Preview league'}</Button>
      </Card>
      {preview ? <Card><Text style={styles.leagueName}>{preview.name}</Text><Text style={styles.details}>{preview.member_count} members · {preview.fantasy_enabled ? 'Fantasy on' : 'Fantasy off'} · {preview.betting_enabled ? 'Betting on' : 'Betting off'}</Text><Button onPress={requestToJoin} disabled={busy}>{preview.already_member ? 'Open league' : 'Request to join'}</Button><Button variant="secondary" onPress={() => setPreview(null)}>Cancel</Button></Card> : null}
      {message ? <Message tone={message.startsWith('Request sent') ? 'success' : 'error'}>{message}</Message> : null}
      {requests.length ? <Card><Text style={styles.sectionTitle}>Recent requests</Text>{requests.map(request => <View key={request.id} style={styles.request}><View style={styles.requestCopy}><Text style={styles.requestName}>{request.league_name}</Text><Text style={styles.details}>{request.status === 'pending' ? 'Waiting for admin approval' : 'Not approved - you can request again'}</Text></View><Text style={[styles.status, request.status === 'rejected' && styles.rejected]}>{request.status}</Text></View>)}</Card> : null}
      <View style={styles.orRow}><View style={styles.line} /><Text style={styles.or}>OR</Text><View style={styles.line} /></View>
      <Button variant="secondary" onPress={() => router.push('/create-league')}>Create a league</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  leagueName: { color: colors.chalk, fontSize: 24, fontWeight: '900' },
  sectionTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' },
  details: { color: colors.chalkMuted, fontSize: 12, lineHeight: 18 },
  request: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  requestCopy: { flex: 1 },
  requestName: { color: colors.chalk, fontSize: 14, fontWeight: '800' },
  status: { color: colors.gold, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  rejected: { color: colors.danger },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.goldMuted },
  or: { color: colors.chalkMuted, fontSize: 10, fontWeight: '900' },
});
