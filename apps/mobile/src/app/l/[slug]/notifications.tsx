import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack } from '@/components/AdminChrome';
import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useNativeServices } from '@/providers/NativeServicesProvider';

type NotificationPreferences = {
  announcements: boolean;
  new_game: boolean;
  lineups_ready: boolean;
  final_results: boolean;
  fantasy_deadline: boolean;
  join_request: boolean;
  join_approved: boolean;
  betting_unlocked: boolean;
  matchday_reminder: boolean;
  fantasy_reminder_minutes: number;
};

const defaults: NotificationPreferences = {
  announcements: true,
  new_game: true,
  lineups_ready: true,
  final_results: true,
  fantasy_deadline: true,
  join_request: true,
  join_approved: true,
  betting_unlocked: true,
  matchday_reminder: true,
  fantasy_reminder_minutes: 120,
};

const reminderOptions = [30, 60, 120, 180, 360, 1440];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const { league, loading, switching } = useScopedLeague(slug);
  const services = useNativeServices();
  const [preferences, setPreferences] = useState(defaults);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null);

  useEffect(() => {
    if (!user || !league) return;
    let active = true;
    void getSupabaseClient().from('notification_preferences')
      .select('announcements, new_game, lineups_ready, final_results, fantasy_deadline, join_request, join_approved, betting_unlocked, matchday_reminder, fantasy_reminder_minutes')
      .eq('user_id', user.id)
      .eq('league_id', league.id)
      .maybeSingle()
      .then(result => {
        if (!active) return;
        if (result.error) setMessage({ text: friendlyMobileError(result.error, 'Your notification choices could not be loaded.'), tone: 'error' });
        else if (result.data) setPreferences(result.data as NotificationPreferences);
        setPreferencesLoading(false);
      });
    return () => { active = false; };
  }, [league, user]);

  function update<Key extends keyof NotificationPreferences>(key: Key, value: NotificationPreferences[Key]) {
    setPreferences(current => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!user || !league) return;
    setSaving(true);
    setMessage(null);
    const result = await getSupabaseClient().from('notification_preferences').upsert({
      user_id: user.id,
      league_id: league.id,
      ...preferences,
    }, { onConflict: 'league_id,user_id' });
    setMessage(result.error
      ? { text: friendlyMobileError(result.error, 'Your notification choices could not be saved.'), tone: 'error' }
      : { text: 'Notification choices saved.', tone: 'success' });
    setSaving(false);
  }

  async function enableDevice() {
    setMessage(null);
    try {
      await services.enableNotifications();
      setMessage({ text: 'Notifications are enabled on this device.', tone: 'success' });
    } catch (error) {
      setMessage({ text: friendlyMobileError(error, 'Notifications could not be enabled.'), tone: 'error' });
    }
  }

  async function disableDevice() {
    setMessage(null);
    try {
      await services.disableNotifications();
      setMessage({ text: 'Notifications are disabled on this device.', tone: 'success' });
    } catch (error) {
      setMessage({ text: friendlyMobileError(error, 'Notifications could not be disabled.'), tone: 'error' });
    }
  }

  if (loading || switching || !league) return <Loading label="Loading notification settings..." />;

  const deviceState = services.notificationState;
  return <Screen>
    <LeagueHeader league={league} />
    <LeagueNav league={league} />
    <AdminBack label="Settings" onPress={() => router.back()} />
    <View><Title>Notifications</Title><Body>Choose what reaches this device and what you receive from {league.name}.</Body></View>
    {message ? <Message tone={message.tone}>{message.text}</Message> : null}
    {services.notificationError ? <Message tone="error">{services.notificationError}</Message> : null}

    <Card>
      <View style={styles.row}>
        <View style={styles.copy}><Text style={styles.heading}>This device</Text><Text style={styles.detail}>{deviceState.registered ? 'Ready for matchweek updates.' : deviceState.permission === 'denied' ? 'Notifications are blocked in system settings.' : deviceState.supported ? 'Enable alerts for reminders and results.' : 'Push notifications require a physical iOS or Android device.'}</Text></View>
        <Text style={[styles.status, deviceState.registered && styles.statusOn]}>{deviceState.registered ? 'ON' : 'OFF'}</Text>
      </View>
      {deviceState.permission === 'denied'
        ? <Button variant="secondary" onPress={services.openSystemSettings}>Open system settings</Button>
        : deviceState.registered
          ? <Button variant="secondary" disabled={services.notificationBusy} onPress={disableDevice}>{services.notificationBusy ? 'Updating...' : 'Disable on this device'}</Button>
          : <Button disabled={services.notificationBusy || !deviceState.supported} onPress={enableDevice}>{services.notificationBusy ? 'Enabling...' : 'Enable notifications'}</Button>}
    </Card>

    <Card>
      <Text style={styles.heading}>From this league</Text>
      <Text style={styles.detail}>These choices follow your account across every device.</Text>
      {preferencesLoading ? <Body>Loading your choices...</Body> : <>
        <Preference label="App announcements" detail="Important Thursday League updates" checked={preferences.announcements} onChange={value => update('announcements', value)} />
        <Preference label="New games" detail="When a game is scheduled" checked={preferences.new_game} onChange={value => update('new_game', value)} />
        <Preference label="Confirmed lineups" detail="When lineups and Fantasy open" checked={preferences.lineups_ready} onChange={value => update('lineups_ready', value)} />
        <Preference label="Matchday reminder" detail="A reminder on the morning of a game" checked={preferences.matchday_reminder} onChange={value => update('matchday_reminder', value)} />
        <Preference label="Fantasy deadline" detail="Only when your team is not saved" checked={preferences.fantasy_deadline} onChange={value => update('fantasy_deadline', value)} />
        <Preference label="Final results" detail="Score and Fantasy result updates" checked={preferences.final_results} onChange={value => update('final_results', value)} />
        <Preference label="Betting unlocked" detail="When betting opens after three completed games" checked={preferences.betting_unlocked} onChange={value => update('betting_unlocked', value)} />
        <Preference label="Join request updates" detail="Requests and approvals that involve you" checked={preferences.join_request && preferences.join_approved} onChange={value => setPreferences(current => ({ ...current, join_request: value, join_approved: value }))} />

        <View style={styles.reminderBlock}>
          <Text style={styles.preferenceLabel}>Fantasy reminder time</Text>
          <Text style={styles.detail}>Before the scheduled kickoff</Text>
          <View style={styles.optionRow}>{reminderOptions.map(minutes => <Pressable
            key={minutes}
            accessibilityRole="radio"
            accessibilityState={{ checked: preferences.fantasy_reminder_minutes === minutes, disabled: !preferences.fantasy_deadline }}
            accessibilityLabel={formatMinutes(minutes)}
            disabled={!preferences.fantasy_deadline}
            onPress={() => update('fantasy_reminder_minutes', minutes)}
            style={[styles.option, preferences.fantasy_reminder_minutes === minutes && styles.optionSelected, !preferences.fantasy_deadline && styles.optionDisabled]}
          ><Text style={[styles.optionText, preferences.fantasy_reminder_minutes === minutes && styles.optionTextSelected]}>{shortMinutes(minutes)}</Text></Pressable>)}</View>
        </View>
        <Button disabled={saving} onPress={save}>{saving ? 'Saving...' : 'Save choices'}</Button>
      </>}
    </Card>
  </Screen>;
}

function Preference({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.preference}>
    <View style={styles.copy}><Text style={styles.preferenceLabel}>{label}</Text><Text style={styles.detail}>{detail}</Text></View>
    <Switch accessibilityLabel={label} value={checked} onValueChange={onChange} trackColor={{ false: colors.ink800, true: colors.turf900 }} thumbColor={checked ? colors.turf400 : colors.chalkMuted} ios_backgroundColor={colors.ink800} />
  </View>;
}

function shortMinutes(minutes: number) { return minutes === 1440 ? '1d' : minutes < 60 ? `${minutes}m` : `${minutes / 60}h`; }
function formatMinutes(minutes: number) { return minutes === 1440 ? '1 day before' : minutes < 60 ? `${minutes} minutes before` : `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'} before`; }

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
  heading: { color: colors.chalk, fontSize: 19, fontWeight: '900' },
  detail: { color: colors.chalkMuted, fontSize: 12, lineHeight: 17 },
  status: { overflow: 'hidden', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.pill, color: colors.chalkMuted, fontSize: 10, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 5 },
  statusOn: { borderColor: colors.turf400, color: colors.turf400 },
  preference: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.goldMuted, paddingVertical: spacing.md },
  preferenceLabel: { color: colors.chalk, fontSize: 14, fontWeight: '800' },
  reminderBlock: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.goldMuted, paddingTop: spacing.md },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, backgroundColor: colors.ink800, paddingHorizontal: spacing.sm },
  optionSelected: { borderColor: colors.gold, backgroundColor: '#302714' },
  optionDisabled: { opacity: 0.4 },
  optionText: { color: colors.chalkMuted, fontWeight: '800' },
  optionTextSelected: { color: colors.gold },
});
