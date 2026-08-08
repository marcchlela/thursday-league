import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

import { Body, Button, Card, Eyebrow, Field, Message, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { friendlyMobileError } from '@/lib/api';
import { requireMobileEnvironment } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import type { League } from '@/lib/types';
import { useLeagues } from '@/providers/LeagueProvider';

type CreatedLeague = Pick<League, 'id' | 'name' | 'slug' | 'join_code' | 'timezone'> & { role: 'owner' };

export default function CreateLeagueScreen() {
  const router = useRouter();
  const { refreshLeagues } = useLeagues();
  const [name, setName] = useState('');
  const [fantasy, setFantasy] = useState(true);
  const [betting, setBetting] = useState(true);
  const [created, setCreated] = useState<CreatedLeague | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create() {
    if (name.trim().length < 2) return setMessage('League name needs at least 2 characters.');
    setBusy(true);
    setMessage(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await getSupabaseClient().rpc('create_league', {
        league_name: name.trim(),
        enable_fantasy: fantasy,
        enable_betting: betting,
        owner_timezone: timezone,
      });
      if (result.error) throw result.error;
      const league = result.data as CreatedLeague;
      setCreated(league);
      await refreshLeagues(league.id);
      const invitation = await getSupabaseClient().rpc('create_league_invite_link', { target_league_id: league.id, valid_hours: 72 });
      if (!invitation.error) setInviteToken((invitation.data as { token: string }).token);
    } catch (error) {
      setMessage(friendlyMobileError(error, 'Your league could not be created.'));
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    await Clipboard.setStringAsync(value);
    setMessage(`${label} copied.`);
  }

  const inviteUrl = inviteToken ? `${requireMobileEnvironment().webUrl.replace(/\/$/, '')}/invite/${inviteToken}` : null;
  if (created) {
    return <Screen><Eyebrow>LEAGUE CREATED</Eyebrow><Title>{created.name} is ready.</Title><Body>Your first season, settings and owner access are set up. Invite your group when you are ready.</Body><Card><Text style={styles.codeLabel}>LEAGUE CODE</Text><Text style={styles.code}>{created.join_code}</Text><Button variant="secondary" onPress={() => copy(created.join_code, 'League code')}>Copy code</Button>{inviteUrl ? <><Button variant="secondary" onPress={() => copy(inviteUrl, 'Invite link')}>Copy invite link</Button><Button variant="secondary" onPress={() => Share.share({ message: `Join ${created.name} on Thursday League: ${inviteUrl}` })}>Share invite</Button></> : <Message>Invite link generation is still finishing. You can create one from the league later.</Message>}{message ? <Message tone="success">{message}</Message> : null}<Button onPress={() => router.replace({ pathname: '/l/[slug]', params: { slug: created.slug } })}>Open league</Button></Card></Screen>;
  }

  return <Screen><Eyebrow>NEW LEAGUE</Eyebrow><Title>Build your matchweek.</Title><Body>Name the league and choose what your group wants to play. Both features start enabled.</Body><Card><Field label="League name" value={name} onChangeText={setName} maxLength={60} placeholder="Thursday Five-a-Side" /> <FeatureToggle label="Fantasy" detail="Pick five players and a captain each matchweek." enabled={fantasy} onPress={() => setFantasy(value => !value)} /><FeatureToggle label="Betting" detail="Virtual league coins. Unlocks after 3 completed games." enabled={betting} onPress={() => setBetting(value => !value)} />{message ? <Message tone="error">{message}</Message> : null}<Button onPress={create} disabled={busy}>{busy ? 'Creating...' : 'Create league'}</Button><Button variant="secondary" onPress={() => router.back()}>Cancel</Button></Card></Screen>;
}

function FeatureToggle({ label, detail, enabled, onPress }: { label: string; detail: string; enabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={onPress} style={styles.toggleRow}><View style={styles.toggleCopy}><Text style={styles.toggleLabel}>{label}</Text><Text style={styles.toggleDetail}>{detail}</Text></View><View style={[styles.switch, enabled && styles.switchOn]}><View style={[styles.knob, enabled && styles.knobOn]} /></View></Pressable>;
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  toggleCopy: { flex: 1 },
  toggleLabel: { color: colors.chalk, fontFamily: fonts.sansExtraBold, fontSize: 14 },
  toggleDetail: { marginTop: 3, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  switch: { width: 50, height: 30, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink900, padding: 3 },
  switchOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.chalkMuted },
  knobOn: { alignSelf: 'flex-end', backgroundColor: colors.ink900 },
  codeLabel: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 9, letterSpacing: 2, textAlign: 'center' },
  code: { color: colors.chalk, fontFamily: fonts.monoBold, fontSize: 30, letterSpacing: 2, textAlign: 'center' },
});
