import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack, AdminCardHeader, AdminHero } from '@/components/AdminChrome';
import { Avatar } from '@/components/Avatar';
import { LeagueHeader } from '@/components/LeagueChrome';
import { Button, Card, Loading, Message, Pill, Screen } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
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
    if (requestResult.error || membershipResult.error || directoryResult.error) { setTone('error'); setMessage('League members could not be loaded.'); return; }
    setRequests((requestResult.data || []) as JoinRequest[]);
    setMemberships((membershipResult.data || []) as LeagueMembership[]);
    setDirectory((directoryResult.data || []) as DirectoryEntry[]);
  }, [allowed, league]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const entry = (id?: string) => directory.find(item => item.id === id);
  const username = (id?: string) => entry(id)?.username || 'League user';

  async function review(request: JoinRequest, approve: boolean) {
    if (!session) return;
    setBusy(request.id); setMessage(null);
    try { await apiRequest({ path: '/api/leagues/membership', token: session.access_token, body: { action: 'review', requestId: request.id, approve } }); setTone('success'); setMessage(approve ? 'Member approved.' : 'Request declined.'); await load(); }
    catch (error) { setTone('error'); setMessage(friendlyMobileError(error, 'The request could not be reviewed.')); }
    finally { setBusy(null); }
  }

  async function createInvite() {
    if (!league) return;
    setBusy('invite');
    const result = await getSupabaseClient().rpc('create_league_invite_link', { target_league_id: league.id, valid_hours: 72 });
    setBusy(null);
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'An invite link could not be created.')); return; }
    const url = `${requireMobileEnvironment().webUrl.replace(/\/$/, '')}/invite/${(result.data as { token: string }).token}`;
    setInviteUrl(url); await Clipboard.setStringAsync(url); setTone('success'); setMessage('Invite link copied. It expires in 72 hours and can be used once.');
  }

  async function changeRole(target: LeagueMembership, makeAdmin: boolean) {
    if (!league) return;
    setBusy(target.user_id);
    const result = await getSupabaseClient().rpc('set_league_member_role', { target_league_id: league.id, target_user_id: target.user_id, make_admin: makeAdmin });
    setBusy(null);
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'The member role could not be changed.')); return; }
    setTone('success'); setMessage(makeAdmin ? 'Member promoted to admin.' : 'Admin changed to member.'); await load();
  }

  async function remove(target: LeagueMembership) {
    if (!league) return;
    setBusy(target.user_id);
    const result = await getSupabaseClient().rpc('remove_league_member', { target_league_id: league.id, target_user_id: target.user_id });
    setBusy(null);
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'The member could not be removed.')); return; }
    setTone('success'); setMessage('Member removed from this league.'); await load();
  }

  async function transfer(target: LeagueMembership) {
    if (!league) return;
    setBusy(target.user_id);
    const result = await getSupabaseClient().rpc('transfer_league_ownership', { target_league_id: league.id, target_user_id: target.user_id });
    setBusy(null);
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'Ownership could not be transferred.')); return; }
    setTone('success'); setMessage('Ownership transferred. You are now a league admin.'); await refreshLeagues(league.id); await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading league members..." />;
  if (!allowed) return <Screen><Message tone="error">League admin access is required.</Message><Button onPress={() => router.back()}>Go back</Button></Screen>;
  return <Screen header={<LeagueHeader league={league} />} compact><AdminBack onPress={() => router.back()} /><AdminHero eyebrow="MEMBER CONTROL" title="Members & invites." text="Code requests need approval. One-tap invite links join immediately after the invited user accepts." icon={{ ios: 'person.2.badge.gearshape.fill', android: 'manage_accounts' }} />{message ? <Message tone={tone}>{message}</Message> : null}<Card><AdminCardHeader title="Invite a friend" detail="Share the reusable code or create a secure one-use link." icon={{ ios: 'person.badge.plus', android: 'person_add' }} /><View style={styles.codeBlock}><Text style={styles.codeLabel}>LEAGUE CODE</Text><Text selectable style={styles.code}>{league.join_code}</Text></View><Text style={styles.detail}>League-code requests always require approval from an owner or admin.</Text><Button variant="secondary" onPress={async () => { await Clipboard.setStringAsync(league.join_code); setTone('success'); setMessage('League code copied.'); }}>Copy league code</Button><Button onPress={createInvite} disabled={!!busy}>{busy === 'invite' ? 'Creating...' : 'Create & copy one-tap invite'}</Button>{inviteUrl ? <Button variant="secondary" onPress={() => Share.share({ message: `Join ${league.name} on Thursday League: ${inviteUrl}` })}>Share invite</Button> : null}</Card><Card><AdminCardHeader title="Pending requests" detail="Review people who entered this league code." icon={{ ios: 'person.crop.circle.badge.questionmark', android: 'how_to_reg' }} count={requests.length} />{requests.length ? requests.map(request => <View key={request.id} style={styles.request}><Avatar name={username(request.user_id)} path={entry(request.user_id)?.avatar_path} size={42} /><View style={styles.copy}><Text style={styles.name}>{username(request.user_id)}</Text><Text style={styles.detail}>Requested to join</Text></View><View style={styles.inlineActions}><SmallAction label="Decline" danger disabled={!!busy} onPress={() => Alert.alert('Decline request?', `${username(request.user_id)} will not join the league.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Decline', style: 'destructive', onPress: () => void review(request, false) }])} /><SmallAction label="Approve" disabled={!!busy} onPress={() => Alert.alert('Approve member?', `${username(request.user_id)} will join ${league.name}.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void review(request, true) }])} /></View></View>) : <Text style={styles.empty}>No pending requests.</Text>}</Card><Card><AdminCardHeader title="Active members" detail="Roles and access apply only inside this league." icon={{ ios: 'person.3.fill', android: 'groups' }} count={memberships.length} />{loading ? <Text style={styles.empty}>Loading active members...</Text> : memberships.map(item => <View key={item.id} style={styles.member}><Avatar name={username(item.user_id)} path={entry(item.user_id)?.avatar_path} size={42} /><View style={styles.copy}><View style={styles.nameRow}><Text numberOfLines={1} style={styles.name}>{username(item.user_id)}</Text>{item.user_id === user?.id ? <Pill tone="gold">You</Pill> : null}</View><Text style={styles.role}>{item.role}</Text></View>{item.role !== 'owner' && item.user_id !== user?.id ? <View style={styles.memberActions}>{membership.role === 'owner' ? <SmallAction label={item.role === 'admin' ? 'Demote' : 'Admin'} disabled={!!busy} onPress={() => Alert.alert(item.role === 'admin' ? 'Make this admin a member?' : 'Promote this member to admin?', 'This changes what they can manage inside this league.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => void changeRole(item, item.role !== 'admin') }])} /> : null}{membership.role === 'owner' ? <SmallAction label="Owner" disabled={!!busy} onPress={() => Alert.alert('Transfer league ownership?', `${username(item.user_id)} will become the owner and you will become an admin.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Transfer', style: 'destructive', onPress: () => void transfer(item) }])} /> : null}<SmallAction label="Remove" danger disabled={!!busy} onPress={() => Alert.alert('Remove member?', `${username(item.user_id)} will lose access to this league. Historical results remain.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void remove(item) }])} /></View> : null}</View>)}</Card></Screen>;
}

function SmallAction({ label, danger = false, disabled, onPress }: { label: string; danger?: boolean; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.small, disabled && styles.disabled]}><Text style={[styles.actionText, danger && styles.dangerText]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ codeBlock: { alignItems: 'center', borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: radius.md, backgroundColor: colors.ink800, padding: spacing.md }, codeLabel: { color: colors.goldMuted, fontFamily: fonts.sansBlack, fontSize: 7, letterSpacing: 1.6 }, code: { marginTop: 5, color: colors.gold, fontFamily: fonts.monoBold, fontSize: 27, letterSpacing: 2, textAlign: 'center' }, detail: { marginTop: 2, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 15 }, request: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder }, copy: { flex: 1 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, name: { flexShrink: 1, color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, role: { marginTop: 3, color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 8, textTransform: 'uppercase' }, inlineActions: { flexDirection: 'row', gap: 4 }, small: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, backgroundColor: colors.ink800, paddingHorizontal: 8 }, disabled: { opacity: 0.4 }, actionText: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 8 }, dangerText: { color: colors.danger }, member: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder }, memberActions: { maxWidth: '52%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 }, empty: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16, textAlign: 'center', paddingVertical: spacing.lg } });
