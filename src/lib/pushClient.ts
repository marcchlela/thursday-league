"use client";

import { supabase } from "./supabase";

export const PUSH_STATE_EVENT = "thursday-league:push-state";
export const OPEN_NOTIFICATION_ONBOARDING_EVENT = "thursday-league:open-notification-onboarding";

export type PushDeviceState = {
  supported: boolean;
  installed: boolean;
  isIOS: boolean;
  permission: NotificationPermission | "unsupported";
  enabled: boolean;
};

export function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isInstalledApp() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export function pushIsSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function readPushDeviceState(): Promise<PushDeviceState> {
  const supported = pushIsSupported();
  if (!supported) {
    return {
      supported: false,
      installed: isInstalledApp(),
      isIOS: isIOSDevice(),
      permission: "unsupported",
      enabled: false
    };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    installed: isInstalledApp(),
    isIOS: isIOSDevice(),
    permission: Notification.permission,
    enabled: Boolean(subscription)
  };
}

function vapidKeyToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

export async function pushAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("You must be logged in.");
  return session.access_token;
}

export async function pushResponseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || "The notification request failed.";
}

function announcePushState() {
  window.dispatchEvent(new Event(PUSH_STATE_EVENT));
}

export async function enablePushNotifications() {
  if (!pushIsSupported()) {
    throw new Error(isIOSDevice() && !isInstalledApp()
      ? "Add Thursday League to your Home Screen, then open the installed app to enable notifications."
      : "Push notifications are not supported in this browser.");
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("The public VAPID key is missing.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const createdSubscription = !subscription;

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyToUint8Array(publicKey)
    });
  }

  const token = await pushAccessToken();
  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(subscription.toJSON())
  });

  if (!response.ok) {
    if (createdSubscription) await subscription.unsubscribe();
    throw new Error(await pushResponseError(response));
  }

  announcePushState();
  return subscription;
}

export async function disablePushNotifications() {
  if (!pushIsSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    announcePushState();
    return;
  }

  const token = await pushAccessToken();
  const response = await fetch("/api/push/subscription", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  if (!response.ok) throw new Error(await pushResponseError(response));

  await subscription.unsubscribe();
  announcePushState();
}

export type NotificationOnboardingStatus = "completed" | "dismissed";

export function notificationOnboardingKey(userId: string) {
  return `thursday-league:notification-onboarding:v1:${userId}`;
}

export function readNotificationOnboardingStatus(userId: string) {
  return window.localStorage.getItem(notificationOnboardingKey(userId)) as NotificationOnboardingStatus | null;
}

export function saveNotificationOnboardingStatus(userId: string, status: NotificationOnboardingStatus) {
  window.localStorage.setItem(notificationOnboardingKey(userId), status);
  announcePushState();
}

export async function markNotificationInstallHandoff(userId: string) {
  const { error } = await supabase
    .from("notification_onboarding_handoffs")
    .upsert({ user_id: userId, requested_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error("Could not save the Home Screen setup handoff.");
}

export async function consumeNotificationInstallHandoff(userId: string) {
  const { data, error } = await supabase
    .from("notification_onboarding_handoffs")
    .select("requested_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;

  const { error: deleteError } = await supabase
    .from("notification_onboarding_handoffs")
    .delete()
    .eq("user_id", userId);
  if (deleteError) return false;

  const requestedAt = new Date(data.requested_at).getTime();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  return Number.isFinite(requestedAt) && Date.now() - requestedAt <= fourteenDays;
}
