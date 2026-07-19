"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  Pill,
  PrimaryButton,
  SecondaryButton
} from "./ui";

function vapidKeyToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const decoded = window.atob(base64);

  return Uint8Array.from(decoded, character =>
    character.charCodeAt(0)
  );
}

async function accessToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be logged in.");
  }

  return session.access_token;
}

async function responseError(response: Response) {
  const body = await response
    .json()
    .catch(() => null) as { error?: string } | null;

  return body?.error || "The notification request failed.";
}

export function NotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [detecting, setDetecting] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function detect() {
      const isSupported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      setSupported(isSupported);

      if (!isSupported) {
        setDetecting(false);
        return;
      }

      setPermission(Notification.permission);

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        await registration.pushManager.getSubscription();

      setEnabled(Boolean(subscription));
      setDetecting(false);
    }

    void detect();
  }, []);

  async function enableNotifications() {
    setBusy(true);
    setMessage(null);

    try {
      const publicKey =
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!publicKey) {
        throw new Error("The public VAPID key is missing.");
      }

      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== "granted") {
        throw new Error("Notification permission was not granted.");
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription =
        await registration.pushManager.getSubscription();

      const createdSubscription = !subscription;

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyToUint8Array(publicKey)
        });
      }

      const token = await accessToken();

      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(subscription.toJSON())
      });

      if (!response.ok) {
        if (createdSubscription) {
          await subscription.unsubscribe();
        }

        throw new Error(await responseError(response));
      }

      setEnabled(true);
      setMessage("Notifications are enabled on this device.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not enable notifications."
      );
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    setMessage(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        await registration.pushManager.getSubscription();

      if (!subscription) {
        setEnabled(false);
        return;
      }

      const token = await accessToken();

      const response = await fetch("/api/push/subscription", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint
        })
      });

      if (!response.ok) {
        throw new Error(await responseError(response));
      }

      await subscription.unsubscribe();
      setEnabled(false);
      setMessage("Notifications are disabled on this device.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not disable notifications."
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendTestNotification() {
    setBusy(true);
    setMessage(null);

    try {
      const token = await accessToken();
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(await responseError(response));
      }

      setMessage("Test notification sent.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not send the test notification."
      );
    } finally {
      setBusy(false);
    }
  }

  if (detecting) {
    return (
      <Card className="lg:col-span-2">
        <p className="text-sm text-chalk/60">
          Checking notification support…
        </p>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          {enabled ? (
            <BellRing className="mt-1 text-perimeter-400" />
          ) : (
            <BellOff className="mt-1 text-chalk/45" />
          )}

          <div>
            <h2 className="font-display text-3xl uppercase">
              Push notifications
            </h2>

            <p className="mt-1 max-w-xl text-sm text-chalk/55">
              Receive game announcements, lineup updates, fantasy
              reminders, and final results on this device.
            </p>
          </div>
        </div>

        <Pill>
          {enabled
            ? "Enabled"
            : permission === "denied"
              ? "Blocked"
              : "Disabled"}
        </Pill>
      </div>

      <div className="mt-5">
        {!supported ? (
          <p className="text-sm text-floodlight">
            Push notifications are not supported in this browser. On
            iPhone, install the app on your Home Screen first.
          </p>
        ) : permission === "denied" ? (
          <p className="text-sm text-floodlight">
            Notifications are blocked. Open the browser’s site settings
            and allow notifications for this app.
          </p>
        ) : enabled ? (
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              type="button"
              disabled={busy}
              onClick={sendTestNotification}
            >
              {busy ? "Sending..." : "Send test notification"}
            </PrimaryButton>

            <SecondaryButton
              type="button"
              disabled={busy}
              onClick={disableNotifications}
            >
              Disable notifications
            </SecondaryButton>
          </div>
        ) : (
          <PrimaryButton
            type="button"
            disabled={busy}
            onClick={enableNotifications}
          >
            {busy ? "Enabling…" : "Enable notifications"}
          </PrimaryButton>
        )}

        {message ? (
          <p className="mt-3 text-sm text-chalk/65">{message}</p>
        ) : null}
      </div>
    </Card>
  );
}
