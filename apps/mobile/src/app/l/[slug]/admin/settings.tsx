import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack, AdminCardHeader, AdminHero } from '@/components/AdminChrome';
import { LeagueHeader } from '@/components/LeagueChrome';
import { Button, Card, Field, Loading, Message, Screen } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import { useLeagues } from '@/providers/LeagueProvider';

export default function AdminLeagueSettingsScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { refreshLeagues } = useLeagues();
  const { league, membership, loading, switching } = useScopedLeague(slug);
  const [name, setName] = useState('');
  const [fantasy, setFantasy] = useState(true);
  const [betting, setBetting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('error');

  useEffect(() => {
    if (!league) return;
    void Promise.resolve().then(() => {
      setName(league.name);
      setFantasy(league.fantasy_enabled);
      setBetting(league.betting_enabled);
    });
  }, [league]);

  async function save() {
    if (!league) return;
    if (name.trim().length < 2) return setMessage('League name needs at least 2 characters.');
    setBusy(true);
    const result = await getSupabaseClient().rpc('update_league_options', { target_league_id: league.id, league_name: name.trim(), enable_fantasy: fantasy, enable_betting: betting, unlock_betting_after_games: 3 });
    setBusy(false);
    if (result.error) { setTone('error'); setMessage(friendlyMobileError(result.error, 'League settings could not be saved.')); return; }
    setTone('success'); setMessage('League settings saved.'); await refreshLeagues(league.id);
  }

  if (loading || switching || !league) return <Loading label="Loading league settings..." />;
  if (membership?.role !== 'owner' && membership?.role !== 'admin') return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  return <Screen header={<LeagueHeader league={league} />} compact>
    <AdminBack onPress={() => router.back()} />
    <AdminHero eyebrow="LEAGUE SETTINGS" title="Core options." text="Keep the weekly football setup simple. Prediction unlock timing stays fixed across Thursday League." icon={{ ios: 'slider.horizontal.3', android: 'tune' }} />
    {message ? <Message tone={tone}>{message}</Message> : null}
    <Card><AdminCardHeader title="League identity" detail="The name members see in the switcher and invites." icon={{ ios: 'shield.fill', android: 'shield' }} /><Field label="League name" value={name} onChangeText={setName} maxLength={60} /></Card>
    <Card><AdminCardHeader title="Ways to play" detail="Both are enabled for new leagues by default." icon={{ ios: 'gamecontroller.fill', android: 'sports_esports' }} /><Toggle label="Fantasy" detail="Five-player squads and season standings." value={fantasy} onPress={() => setFantasy(value => !value)} /><Toggle label="Predictions" detail="Virtual coins and markets after three completed games." value={betting} onPress={() => setBetting(value => !value)} /><View style={styles.fixed}><View style={styles.fixedTop}><Text style={styles.fixedLabel}>PREDICTION UNLOCK</Text><Text style={styles.locked}>FIXED</Text></View><Text style={styles.fixedValue}>3 completed games</Text><Text style={styles.detail}>This platform rule is automatic and cannot be changed by league admins.</Text></View><Button onPress={save} disabled={busy}>{busy ? 'Saving...' : 'Save settings'}</Button></Card>
  </Screen>;
}

function Toggle({ label, detail, value, onPress }: { label: string; detail: string; value: boolean; onPress: () => void }) { return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={styles.toggle}><View style={styles.toggleCopy}><Text style={styles.label}>{label}</Text><Text style={styles.detail}>{detail}</Text></View><View style={[styles.switch, value && styles.switchOn]}><View style={[styles.knob, value && styles.knobOn]} /></View></Pressable>; }
const styles = StyleSheet.create({ toggle: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.goldBorder }, toggleCopy: { flex: 1 }, label: { color: colors.chalk, fontFamily: fonts.sansExtraBold, fontSize: 13 }, detail: { marginTop: 3, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 15 }, switch: { width: 50, height: 30, justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: colors.goldBorder, padding: 3 }, switchOn: { backgroundColor: colors.gold }, knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.chalkMuted }, knobOn: { alignSelf: 'flex-end', backgroundColor: colors.ink900 }, fixed: { borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.ink800, padding: spacing.md }, fixedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fixedLabel: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 8, letterSpacing: 1.5 }, locked: { color: colors.chalk45, fontFamily: fonts.sansBlack, fontSize: 7, letterSpacing: 1, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 }, fixedValue: { marginTop: 4, color: colors.chalk, fontFamily: fonts.sansExtraBold, fontSize: 15 } });
