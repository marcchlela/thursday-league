import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { apiRequest, friendlyMobileError } from '@/lib/api';
import { requireMobileEnvironment } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import type { JoinRequest, LeagueMembership } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useLeagues } from '@/providers/LeagueProvider';

type DirectoryEntry = { id: string; username: string; avatar_path?: string | null };

export default function MembersScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, user } = useAuth();
  const { refreshLeagues } = useLeagues();
  const { league, membership, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [memberships, setMemberships] = useState<LeagueMembership[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const allowed = membership?.role === 'owner' || membership?.role === 'admin';

  const load = useCallback(async () => {
    if (!league || !allowed) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const [requestResult, membershipResult, directoryResult] = await Promise.all([
      supabase.from('league_join_requests').select('*').eq('league_id', league.id).eq('status', 'pending').order('created_at'),
      supabase.from('league_memberships').select('*').eq('league_id', league.id).eq('status', 'active').order('joined_at'),
      supabase.rpc('get_league_member_directory', { target_league_id: league.id }),
    ]);
    setLoading(false);
    if (requestResult.error || membershipResult.error || directoryResult.error) {
      setTone('error');
      setMessage('League members could not be loaded.');
      return;
    }
    setRequests((requestResult.data || []) as JoinRequest[]);
    setMemberships((membershipResult.data || []) as LeagueMembership[]);
    setDirectory((directoryResult.data || []) as DirectoryEntry[]);
  }, [allowed, league]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  async function review(request: JoinRequest, approve: boolean) {
    if (!session) return;
    setBusy(request.id);
    setMessage(null);
    try {
      await apiRequest({ path: '/api/leagues/membership', token: session.access_token, body: { action: 'review', requestId: request.id, approve } });
      setTone('success');
      setMessage(approve ? 'Member approved.' : 'Request declined.');
      await load();
    } catch (error) {
      setTone('error');
      setMessage(friendlyMobileError(error, 'The request could not be reviewed.'));
    } finally { setBusy(null); }
  }

  async function createInvite() {
    if (!league) return;
    setBusy('invite');
    const result = await getSupabaseClient().rpc('create_league_invite_link', { target_league_id: league.id, valid_hours: 72 });
    setBusy(null);
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'An invite link could not be created.'));
      return;
    }
    const token = (result.data as { token: string }).token;
    const url = `${requireMobileEnvironment().webUrl.replace(/\/$/, '')}/invite/${token}`;
    setInviteUrl(url);
    await Clipboard.setStringAsync(url);
    setTone('success');
    setMessage('Invite link copied. It expires in 72 hours and can be used once.');
  }

  async function changeRole(target: LeagueMembership, makeAdmin: boolean) {
    if (!league) return;
    setBusy(target.user_id);
    const result = await getSupabaseClient().rpc('set_league_member_role', { target_league_id: league.id, target_user_id: target.user_id, make_admin: makeAdmin });
    setBusy(null);
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'The member role could not be changed.'));
      return;
    }
    setTone('success');
    setMessage(makeAdmin ? 'Member promoted to admin.' : 'Admin changed to member.');
    await load();
  }

  async function remove(target: LeagueMembership) {
    if (!league) return;
    setBusy(target.user_id);
    const result = await getSupabaseClient().rpc('remove_league_member', { target_league_id: league.id, target_user_id: target.user_id });
    setBusy(null);
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'The member could not be removed.'));
      return;
    }
    setTone('success');
    setMessage('Member removed from this league.');
    await load();
  }

  async function transfer(target: LeagueMembership) {
    if (!league) return;
    setBusy(target.user_id);
    const result = await getSupabaseClient().rpc('transfer_league_ownership', { target_league_id: league.id, target_user_id: target.user_id });
    setBusy(null);
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'Ownership could not be transferred.'));
      return;
    }
    setTone('success');
    setMessage('Ownership transferred. You are now a league admin.');
    await refreshLeagues(league.id);
    await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading league members..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message><Button onPress={() => router.back()}>Go back</Button></Screen>;
  const username = (id?: string) => directory.find(item => item.id === id)?.username || 'League user';

  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.back()}>← League Admin</Button><Eyebrow>MEMBER CONTROL</Eyebrow><Title>Members & invites.</Title><Body>Code requests need approval. A one-tap invite joins immediately after the invited user accepts.</Body>{message ? <Message tone={tone}>{message}</Message> : null}<Card><Text style={styles.sectionTitle}>Invite a friend</Text><Text style={styles.code}>{league.join_code}</Text><Text style={styles.detail}>League-code requests always require an admin approval.</Text><Button variant="secondary" onPress={async () => { await Clipboard.setStringAsync(league.join_code); setTone('success'); setMessage('League code copied.'); }}>Copy league code</Button><Button onPress={createInvite} disabled={!!busy}>{busy === 'invite' ? 'Creating...' : 'Create & copy one-tap invite'}</Button>{inviteUrl ? <Button variant="secondary" onPress={() => Share.share({ message: `Join ${league.name} on Thursday League: ${inviteUrl}` })}>Share invite</Button> : null}</Card><Card><Text style={styles.sectionTitle}>Pending requests · {requests.length}</Text>{requests.length ? requests.map(request => <View key={request.id} style={styles.request}><View style={styles.avatar}><Text style={styles.avatarText}>{username(request.user_id).slice(0, 1).toUpperCase()}</Text></View><View style={styles.copy}><Text style={styles.name}>{username(request.user_id)}</Text><Text style={styles.detail}>Requested to join</Text></View><View style={styles.inlineActions}><Pressable disabled={!!busy} onPress={() => Alert.alert('Decline request?', `${username(request.user_id)} will not join the league.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Decline', style: 'destructive', onPress: () => void review(request, false) }])} style={styles.small}><Text style={styles.removeText}>No</Text></Pressable><Pressable disabled={!!busy} onPress={() => Alert.alert('Approve member?', `${username(request.user_id)} will join ${league.name}.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void review(request, true) }])} style={styles.small}><Text style={styles.actionText}>Yes</Text></Pressable></View></View>) : <Text style={styles.detail}>No pending requests.</Text>}</Card>{loading ? <Loading label="Loading active members..." /> : <Card><Text style={styles.sectionTitle}>Active members · {memberships.length}</Text>{memberships.map(item => <View key={item.id} style={styles.member}><View style={styles.copy}><Text style={styles.name}>{username(item.user_id)}{item.user_id === user?.id ? ' · you' : ''}</Text><Text style={styles.role}>{item.role}</Text></View>{item.role !== 'owner' && item.user_id !== user?.id ? <View style={styles.memberActions}>{membership.role === 'owner' ? <Pressable disabled={!!busy} onPress={() => Alert.alert(item.role === 'admin' ? 'Make this admin a member?' : 'Promote this member to admin?', 'This changes what they can manage inside this league.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => void changeRole(item, item.role !== 'admin') }])} style={styles.small}><Text style={styles.actionText}>{item.role === 'admin' ? 'Demote' : 'Admin'}</Text></Pressable> : null}{membership.role === 'owner' ? <Pressable disabled={!!busy} onPress={() => Alert.alert('Transfer league ownership?', `${username(item.user_id)} will become the owner and you will become an admin.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Transfer', style: 'destructive', onPress: () => void transfer(item) }])} style={styles.small}><Text style={styles.actionText}>Owner</Text></Pressable> : null}<Pressable disabled={!!busy} onPress={() => Alert.alert('Remove member?', `${username(item.user_id)} will lose access to this league. Their historical results remain.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void remove(item) }])} style={styles.small}><Text style={styles.removeText}>Remove</Text></Pressable></View> : null}</View>)}</Card>}</Screen>;
}

const styles = StyleSheet.create({ sectionTitle: { color: colors.chalk, fontSize: 19, fontWeight: '900' }, code: { color: colors.gold, fontSize: 28, fontWeight: '900', letterSpacing: 2, textAlign: 'center' }, detail: { marginTop: 2, color: colors.chalkMuted, fontSize: 10, lineHeight: 15 }, request: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.ink800 }, avatarText: { color: colors.gold, fontWeight: '900' }, copy: { flex: 1 }, name: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, role: { marginTop: 2, color: colors.gold, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, inlineActions: { flexDirection: 'row', gap: 4 }, small: { minHeight: 34, justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: 8, paddingHorizontal: 8 }, actionText: { color: colors.gold, fontSize: 9, fontWeight: '900' }, removeText: { color: colors.danger, fontSize: 9, fontWeight: '900' }, member: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, memberActions: { maxWidth: '58%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 } });
