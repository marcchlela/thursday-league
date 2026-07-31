import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Loading, Message, Screen, Title } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { isInternalLoginEmail } from '@/lib/auth';
import { useAuth } from '@/providers/AuthProvider';

export default function ProfileScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user, profile, signOut } = useAuth();
  const { league, membership, loading, switching } = useScopedLeague(slug);
  const [message, setMessage] = useState<string | null>(null);
  if (loading || switching || !league || !profile) return <Loading label="Loading your profile..." />;

  async function logout() {
    try { await signOut(); router.replace('/account'); }
    catch (error) { setMessage(friendlyMobileError(error, 'You could not be signed out.')); }
  }

  return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><View style={styles.hero}><Avatar name={profile.username} path={profile.avatar_path} size={92} /><Eyebrow>YOUR ACCOUNT</Eyebrow><Title>{profile.username}</Title><Body>{membership?.role || 'member'} in {league.name}</Body><Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/profile-photo`)}>Change profile photo</Button></View>{message ? <Message tone="error">{message}</Message> : null}<Card><Text style={styles.cardTitle}>League</Text><Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/players`)}>Players and statistics</Button><Button variant="secondary" onPress={() => router.push('/leagues')}>Switch or add league</Button>{membership?.role === 'owner' || membership?.role === 'admin' ? <Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/admin`)}>League admin</Button> : null}</Card><Card><Text style={styles.cardTitle}>Preferences</Text><Text style={styles.detail}>Control device alerts and per-league reminders.</Text><Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/notifications`)}>Notification settings</Button></Card><Card><Text style={styles.cardTitle}>Account security</Text><Text style={styles.detail}>{user?.new_email ? `Verification pending for ${user.new_email}` : user?.email && !isInternalLoginEmail(user.email) ? `Verified recovery email: ${user.email}` : 'No verified recovery email yet.'}</Text><Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/account-security`)}>Recovery email & password</Button></Card><Button variant="secondary" onPress={logout}>Sign out</Button></Screen>;
}

const styles = StyleSheet.create({ hero: { alignItems: 'center', gap: 8 }, cardTitle: { color: colors.chalk, fontSize: 18, fontWeight: '900' }, detail: { color: colors.chalkMuted, fontSize: 12, lineHeight: 18 } });
