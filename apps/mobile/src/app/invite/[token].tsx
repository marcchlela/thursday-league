import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button, Card, Eyebrow, Icon, Loading, Message, Pill, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
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

  useEffect(() => { if (token) void getSupabaseClient().rpc('preview_league_invite_link', { submitted_token: token }).then(result => { setLoading(false); if (result.error) setMessage('This invitation is invalid, expired or already used.'); else setPreview(result.data as LeaguePreview); }); }, [token]);
  async function continueToAccount() { await savePendingInvite(token); router.push('/account'); }
  async function accept() {
    if (!session || !preview) return;
    setBusy(true); setMessage(null);
    try { const result = await getSupabaseClient().rpc('accept_league_invite_link', { submitted_token: token }); if (result.error) throw result.error; await clearPendingInvite(); await refreshLeagues(preview.id); const accepted = result.data as { slug: string }; router.replace({ pathname: '/l/[slug]', params: { slug: accepted.slug || preview.slug } }); }
    catch (error) { setMessage(friendlyMobileError(error, 'This invitation could not be accepted.')); }
    finally { setBusy(false); }
  }
  if (loading) return <Loading label="Opening your invitation..." />;
  return <Screen compact><View style={styles.top}><View style={styles.mark}><Icon name={{ ios: 'envelope.open.fill', android: 'mark_email_read' }} size={27} color={colors.gold} /></View><Eyebrow>LEAGUE INVITATION</Eyebrow><Title>{preview ? 'You are invited.' : 'Invitation unavailable.'}</Title></View>{preview ? <Card style={styles.preview}><View pointerEvents="none" style={styles.glow} /><View style={styles.badge}><Text style={styles.badgeText}>{preview.name.slice(0, 2).toUpperCase()}</Text></View><Text style={styles.invited}>JOIN</Text><Text style={styles.name}>{preview.name}</Text><View style={styles.meta}><Pill tone="green">{preview.member_count} members</Pill><Pill tone={preview.fantasy_enabled ? 'gold' : 'neutral'}>{preview.fantasy_enabled ? 'Fantasy' : 'No Fantasy'}</Pill><Pill tone={preview.betting_enabled ? 'gold' : 'neutral'}>{preview.betting_enabled ? 'Predictions' : 'No predictions'}</Pill></View><Text style={styles.details}>Accept to enter this league immediately. Its matches, players and tables stay separate from your other leagues.</Text><View style={styles.actions}>{session ? <Button onPress={accept} disabled={busy}>{busy ? 'Joining...' : preview.already_member ? 'Open league' : 'Accept invitation'}</Button> : <Button onPress={continueToAccount}>Log in or create account</Button>}<Button variant="ghost" onPress={() => router.replace('/')}>Not now</Button></View></Card> : null}{message ? <Message tone="error">{message}</Message> : null}</Screen>;
}

const styles = StyleSheet.create({ top: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg }, mark: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: 31, backgroundColor: colors.goldSoft }, preview: { position: 'relative', overflow: 'hidden', alignItems: 'center', paddingVertical: spacing.xl }, glow: { position: 'absolute', right: -55, top: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.goldSoft }, badge: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.gold, borderRadius: radius.xl, backgroundColor: colors.ink900 }, badgeText: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: 27 }, invited: { color: colors.goldMuted, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.8 }, name: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 31, textAlign: 'center', textTransform: 'uppercase' }, meta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }, details: { maxWidth: 380, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, textAlign: 'center' }, actions: { alignSelf: 'stretch', gap: spacing.sm } });
