"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, Clock3, SlidersHorizontal } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { supabase } from "@/lib/supabase";
import { friendlyActionError } from "@/lib/actionErrors";
import {
  disablePushNotifications,
  enablePushNotifications,
  PUSH_STATE_EVENT,
  pushAccessToken,
  PushDeviceState,
  pushResponseError,
  readPushDeviceState
} from "@/lib/pushClient";
import { Pill, PrimaryButton, SecondaryButton, Select } from "./ui";

const initialState: PushDeviceState = {
  supported: false,
  installed: false,
  isIOS: false,
  permission: "unsupported",
  enabled: false
};

type NotificationPreferences = {
  announcements: boolean;
  new_game: boolean;
  lineups_ready: boolean;
  final_results: boolean;
  fantasy_deadline: boolean;
  fantasy_reminder_minutes: number;
};

const defaultPreferences: NotificationPreferences = {
  announcements: true,
  new_game: true,
  lineups_ready: true,
  final_results: true,
  fantasy_deadline: true,
  fantasy_reminder_minutes: 120
};

export function NotificationSettings() {
  const { user } = useAuthProfile();
  const { league } = useLeagueContext();
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
    if (!user || !league) return;
    const leagueId = league.id;
    let cancelled = false;
    async function loadPreferences() {
      setPreferencesLoading(true);
      const { data } = await supabase
        .from("notification_preferences")
        .select("announcements, new_game, lineups_ready, final_results, fantasy_deadline, fantasy_reminder_minutes")
        .eq("user_id", user!.id)
        .eq("league_id", leagueId)
        .maybeSingle();
      if (!cancelled) {
        setPreferences(data ? data as NotificationPreferences : defaultPreferences);
        setPreferencesLoading(false);
      }
    }
    void loadPreferences();
    return () => { cancelled = true; };
  }, [league, user]);

  async function savePreferences() {
    if (!user || !league) return;
    setPreferencesSaving(true);
    setMessage(null);
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: user.id,
      league_id: league.id,
      ...preferences
    }, { onConflict: "league_id,user_id" });
    setMessage(error ? friendlyActionError(error, "Notification preferences could not be saved.") : "Notification preferences saved.");
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
      setMessage(friendlyActionError(error, "Notifications could not be enabled on this device."));
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
      setMessage(friendlyActionError(error, "Notifications could not be disabled on this device."));
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
      setMessage(friendlyActionError(error, "The test notification could not be sent."));
    } finally {
      setBusy(false);
    }
  }

  if (detecting) {
    return <section className="rounded-[1.35rem] border border-league-gold/25 bg-ink-850 p-5 shadow-[0_9px_24px_rgba(0,0,0,.13)]"><div className="skeleton-shimmer h-5 w-56 rounded-lg" /><div className="skeleton-shimmer mt-3 h-3 w-full max-w-md rounded" /></section>;
  }

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
      <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${state.enabled ? "border-turf-400/20 bg-turf-400/[.045] text-turf-400" : "border-chalk/[.07] bg-chalk/[.025] text-chalk/40"}`}>
            {state.enabled ? <BellRing size={19} /> : <BellOff size={19} />}
          </span>
          <div>
            <h2 className="font-display text-2xl uppercase sm:text-3xl">Push notifications</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-chalk/42">Receive game announcements, lineup updates, Fantasy reminders, and final results on this device.</p>
          </div>
        </div>
        <Pill className={state.enabled ? "border-turf-400/20 bg-turf-400/[.055] text-turf-400" : state.permission === "denied" ? "border-red-400/20 bg-red-400/[.055] text-red-300" : "border-chalk/[.07] bg-chalk/[.025] text-chalk/40"}>{state.enabled ? "Enabled" : state.permission === "denied" ? "Blocked" : "Disabled"}</Pill>
      </div>

      <div className="mt-5">
        {!state.supported ? (
          <p className="rounded-xl border border-red-400/15 bg-red-400/[.045] p-3 text-sm text-red-200/80">Push notifications are not supported here.{state.isIOS && !state.installed ? " Add the app to your iPhone Home Screen and open it from there first." : ""}</p>
        ) : state.permission === "denied" ? (
          <p className="rounded-xl border border-red-400/15 bg-red-400/[.045] p-3 text-sm text-red-200/80">Notifications are blocked. Open this app in iPhone Settings or your browser notification settings and allow notifications.</p>
        ) : state.enabled ? (
          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="button" disabled={busy} onClick={sendTestNotification} className="rounded-xl">{busy ? "Sending..." : "Send test notification"}</PrimaryButton>
            <SecondaryButton type="button" disabled={busy} onClick={disable} className="rounded-xl">Disable notifications</SecondaryButton>
          </div>
        ) : (
          <PrimaryButton type="button" disabled={busy} onClick={enable} className="rounded-xl">{busy ? "Enabling..." : "Enable notifications"}</PrimaryButton>
        )}
        {message ? <p className="mt-3 text-sm text-chalk/65">{message}</p> : null}
      </div>
      </div>

      <div className="border-t border-league-gold/12 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold"><SlidersHorizontal size={18} /></span>
          <div><h3 className="font-display text-2xl uppercase">What should we send?</h3><p className="text-xs text-chalk/38">These choices apply to {league?.name || "this league"} across your subscribed devices.</p></div>
        </div>

        {preferencesLoading ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">{Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton-shimmer h-16 rounded-xl border border-league-gold/10" />)}</div>
        ) : (
          <>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <PreferenceToggle label="App announcements" detail="Important updates sent by Thursday League" checked={preferences.announcements} onChange={value => setPreference("announcements", value)} />
              <PreferenceToggle label="New games" detail="When a game is scheduled" checked={preferences.new_game} onChange={value => setPreference("new_game", value)} />
              <PreferenceToggle label="Confirmed lineups" detail="When lineups and fantasy open" checked={preferences.lineups_ready} onChange={value => setPreference("lineups_ready", value)} />
              <PreferenceToggle label="Final results" detail="Score and fantasy result updates" checked={preferences.final_results} onChange={value => setPreference("final_results", value)} />
              <PreferenceToggle label="Fantasy deadline" detail="Only when your team is not saved" checked={preferences.fantasy_deadline} onChange={value => setPreference("fantasy_deadline", value)} />
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-league-gold/12 bg-black/15 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><Clock3 className="text-league-gold/70" size={19} /><div><div className="font-semibold">Reminder time</div><div className="text-xs text-chalk/38">Before the scheduled kickoff</div></div></div>
              <Select className="rounded-xl border-league-gold/15 py-2.5 sm:w-56" disabled={!preferences.fantasy_deadline} value={preferences.fantasy_reminder_minutes} onChange={event => setPreference("fantasy_reminder_minutes", Number(event.target.value))}>
                <option value={30}>30 minutes before</option>
                <option value={60}>1 hour before</option>
                <option value={120}>2 hours before</option>
                <option value={180}>3 hours before</option>
                <option value={360}>6 hours before</option>
                <option value={1440}>1 day before</option>
              </Select>
            </div>
            <PrimaryButton type="button" onClick={savePreferences} disabled={preferencesSaving} className="mt-4 w-full rounded-xl py-3 sm:w-auto">{preferencesSaving ? "Saving..." : "Save preferences"}</PrimaryButton>
          </>
        )}
      </div>
    </section>
  );
}

function PreferenceToggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-league-gold/[.22] bg-chalk/[.018] p-3.5 transition hover:border-league-gold/35">
      <span><span className="block text-sm font-semibold text-chalk">{label}</span><span className="mt-1 block text-xs text-chalk/35">{detail}</span></span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full border border-league-gold/[.22] bg-chalk/[.09] transition peer-checked:border-turf-400/30 peer-checked:bg-turf-500 peer-focus-visible:ring-2 peer-focus-visible:ring-league-gold after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-chalk after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
    </label>
  );
}
