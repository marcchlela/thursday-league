"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, Clock3, SlidersHorizontal } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { supabase } from "@/lib/supabase";
import {
  disablePushNotifications,
  enablePushNotifications,
  PUSH_STATE_EVENT,
  pushAccessToken,
  PushDeviceState,
  pushResponseError,
  readPushDeviceState
} from "@/lib/pushClient";
import { Card, Pill, PrimaryButton, SecondaryButton, Select } from "./ui";

const initialState: PushDeviceState = {
  supported: false,
  installed: false,
  isIOS: false,
  permission: "unsupported",
  enabled: false
};

type NotificationPreferences = {
  new_game: boolean;
  lineups_ready: boolean;
  final_results: boolean;
  fantasy_deadline: boolean;
  fantasy_reminder_minutes: number;
};

const defaultPreferences: NotificationPreferences = {
  new_game: true,
  lineups_ready: true,
  final_results: true,
  fantasy_deadline: true,
  fantasy_reminder_minutes: 120
};

export function NotificationSettings() {
  const { user } = useAuthProfile();
  const [state, setState] = useState<PushDeviceState>(initialState);
  const [detecting, setDetecting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  const refresh = useCallback(async () => {
    setState(await readPushDeviceState());
    setDetecting(false);
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(PUSH_STATE_EVENT, refresh);
    return () => window.removeEventListener(PUSH_STATE_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadPreferences() {
      setPreferencesLoading(true);
      const { data } = await supabase
        .from("notification_preferences")
        .select("new_game, lineups_ready, final_results, fantasy_deadline, fantasy_reminder_minutes")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!cancelled) {
        setPreferences(data ? data as NotificationPreferences : defaultPreferences);
        setPreferencesLoading(false);
      }
    }
    void loadPreferences();
    return () => { cancelled = true; };
  }, [user]);

  async function savePreferences() {
    if (!user) return;
    setPreferencesSaving(true);
    setMessage(null);
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: user.id,
      ...preferences
    }, { onConflict: "user_id" });
    setMessage(error ? error.message : "Notification preferences saved.");
    setPreferencesSaving(false);
  }

  function setPreference(key: keyof NotificationPreferences, value: boolean | number) {
    setPreferences(current => ({ ...current, [key]: value }));
  }

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      await enablePushNotifications();
      setMessage("Notifications are enabled on this device.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      await disablePushNotifications();
      setMessage("Notifications are disabled on this device.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTestNotification() {
    setBusy(true);
    setMessage(null);
    try {
      const token = await pushAccessToken();
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(await pushResponseError(response));
      setMessage("Test notification sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the test notification.");
    } finally {
      setBusy(false);
    }
  }

  if (detecting) {
    return <Card className="lg:col-span-2"><p className="text-sm text-chalk/60">Checking notification support...</p></Card>;
  }

  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          {state.enabled ? <BellRing className="mt-1 text-perimeter-400" /> : <BellOff className="mt-1 text-chalk/45" />}
          <div>
            <h2 className="font-display text-3xl uppercase">Push notifications</h2>
            <p className="mt-1 max-w-xl text-sm text-chalk/55">Receive game announcements, lineup updates, fantasy reminders, and final results on this device.</p>
          </div>
        </div>
        <Pill>{state.enabled ? "Enabled" : state.permission === "denied" ? "Blocked" : "Disabled"}</Pill>
      </div>

      <div className="mt-5">
        {!state.supported ? (
          <p className="text-sm text-floodlight">Push notifications are not supported here.{state.isIOS && !state.installed ? " Add the app to your iPhone Home Screen and open it from there first." : ""}</p>
        ) : state.permission === "denied" ? (
          <p className="text-sm text-floodlight">Notifications are blocked. Open this app in iPhone Settings or your browser notification settings and allow notifications.</p>
        ) : state.enabled ? (
          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="button" disabled={busy} onClick={sendTestNotification}>{busy ? "Sending..." : "Send test notification"}</PrimaryButton>
            <SecondaryButton type="button" disabled={busy} onClick={disable}>Disable notifications</SecondaryButton>
          </div>
        ) : (
          <PrimaryButton type="button" disabled={busy} onClick={enable}>{busy ? "Enabling..." : "Enable notifications"}</PrimaryButton>
        )}
        {message ? <p className="mt-3 text-sm text-chalk/65">{message}</p> : null}
      </div>

      <div className="mt-6 border-t border-white/10 pt-6">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="text-perimeter-400" size={20} />
          <div><h3 className="font-display text-2xl uppercase">What should we send?</h3><p className="text-sm text-chalk/50">These choices apply across all your subscribed devices.</p></div>
        </div>

        {preferencesLoading ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-white/5" />)}</div>
        ) : (
          <>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <PreferenceToggle label="New games" detail="When a game is scheduled" checked={preferences.new_game} onChange={value => setPreference("new_game", value)} />
              <PreferenceToggle label="Confirmed lineups" detail="When lineups and fantasy open" checked={preferences.lineups_ready} onChange={value => setPreference("lineups_ready", value)} />
              <PreferenceToggle label="Final results" detail="Score and fantasy result updates" checked={preferences.final_results} onChange={value => setPreference("final_results", value)} />
              <PreferenceToggle label="Fantasy deadline" detail="Only when your team is not saved" checked={preferences.fantasy_deadline} onChange={value => setPreference("fantasy_deadline", value)} />
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><Clock3 className="text-floodlight" size={19} /><div><div className="font-semibold">Reminder time</div><div className="text-xs text-chalk/45">Before the scheduled kickoff</div></div></div>
              <Select className="sm:w-56" disabled={!preferences.fantasy_deadline} value={preferences.fantasy_reminder_minutes} onChange={event => setPreference("fantasy_reminder_minutes", Number(event.target.value))}>
                <option value={30}>30 minutes before</option>
                <option value={60}>1 hour before</option>
                <option value={120}>2 hours before</option>
                <option value={180}>3 hours before</option>
                <option value={360}>6 hours before</option>
                <option value={1440}>1 day before</option>
              </Select>
            </div>
            <PrimaryButton type="button" onClick={savePreferences} disabled={preferencesSaving} className="mt-4">{preferencesSaving ? "Saving..." : "Save preferences"}</PrimaryButton>
          </>
        )}
      </div>
    </Card>
  );
}

function PreferenceToggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <span><span className="block font-semibold text-chalk">{label}</span><span className="mt-1 block text-xs text-chalk/45">{detail}</span></span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-perimeter-500 peer-focus-visible:ring-2 peer-focus-visible:ring-floodlight after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-chalk after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
    </label>
  );
}
