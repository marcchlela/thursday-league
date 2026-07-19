"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import {
  disablePushNotifications,
  enablePushNotifications,
  PUSH_STATE_EVENT,
  pushAccessToken,
  PushDeviceState,
  pushResponseError,
  readPushDeviceState
} from "@/lib/pushClient";
import { Card, Pill, PrimaryButton, SecondaryButton } from "./ui";

const initialState: PushDeviceState = {
  supported: false,
  installed: false,
  isIOS: false,
  permission: "unsupported",
  enabled: false
};

export function NotificationSettings() {
  const [state, setState] = useState<PushDeviceState>(initialState);
  const [detecting, setDetecting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState(await readPushDeviceState());
    setDetecting(false);
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(PUSH_STATE_EVENT, refresh);
    return () => window.removeEventListener(PUSH_STATE_EVENT, refresh);
  }, [refresh]);

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
    </Card>
  );
}
