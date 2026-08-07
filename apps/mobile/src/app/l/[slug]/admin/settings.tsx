import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Field, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
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
    if (result.error) {
      setTone('error');
      setMessage(friendlyMobileError(result.error, 'League settings could not be saved.'));
      return;
    }
    setTone('success');
    setMessage('League settings saved.');
    await refreshLeagues(league.id);
  }

  if (loading || switching || !league) return <Loading label="Loading league settings..." />;
  if (membership?.role !== 'owner' && membership?.role !== 'admin') return <Screen><Message tone="error">League admin access is required.</Message></Screen>;
  return <Screen><LeagueHeader league={league} /><Button variant="secondary" onPress={() => router.back()}>← League Admin</Button><Eyebrow>LEAGUE SETTINGS</Eyebrow><Title>Core options.</Title><Body>Keep the weekly football setup simple. Prediction unlock timing stays fixed platform-wide.</Body>{message ? <Message tone={tone}>{message}</Message> : null}<Card><Field label="League name" value={name} onChangeText={setName} maxLength={60} /><Toggle label="Fantasy" detail="Five-player squads and season standings." value={fantasy} onPress={() => setFantasy(value => !value)} /><Toggle label="Predictions" detail="Virtual coins and markets after three completed games." value={betting} onPress={() => setBetting(value => !value)} /><View style={styles.fixed}><Text style={styles.fixedLabel}>PREDICTION UNLOCK</Text><Text style={styles.fixedValue}>3 completed games</Text><Text style={styles.detail}>This platform rule cannot be changed by a league admin.</Text></View><Button onPress={save} disabled={busy}>{busy ? 'Saving...' : 'Save settings'}</Button></Card></Screen>;
}

function Toggle({ label, detail, value, onPress }: { label: string; detail: string; value: boolean; onPress: () => void }) { return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={styles.toggle}><View style={styles.toggleCopy}><Text style={styles.label}>{label}</Text><Text style={styles.detail}>{detail}</Text></View><View style={[styles.switch, value && styles.switchOn]}><View style={[styles.knob, value && styles.knobOn]} /></View></Pressable>; }
const styles = StyleSheet.create({ toggle: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, toggleCopy: { flex: 1 }, label: { color: colors.chalk, fontSize: 14, fontWeight: '900' }, detail: { marginTop: 3, color: colors.chalkMuted, fontSize: 10, lineHeight: 15 }, switch: { width: 50, height: 30, justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: colors.goldMuted, padding: 3 }, switchOn: { backgroundColor: colors.gold }, knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.chalkMuted }, knobOn: { alignSelf: 'flex-end', backgroundColor: colors.ink900 }, fixed: { borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, backgroundColor: colors.ink800, padding: spacing.md }, fixedLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, fixedValue: { marginTop: 4, color: colors.chalk, fontSize: 16, fontWeight: '900' } });
