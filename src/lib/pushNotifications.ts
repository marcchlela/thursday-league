import "server-only";

import webPush from "web-push";
import { createSupabaseAdmin } from "./supabaseAdmin";

export type NotificationType = "new_game" | "lineups_ready" | "final_results" | "fantasy_deadline" | "announcement";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  ttl?: number;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

type PushError = Error & { statusCode?: number };

type DeliveryResult = {
  ok: boolean;
  expired: boolean;
  error?: string;
};

export type PushSendResult = {
  dispatchId?: string;
  total: number;
  sent: number;
  failed: number;
  removed: number;
  skipped?: boolean;
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID configuration is incomplete.");
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
}

async function deliverOne(subscription: PushSubscriptionRow, payload: PushPayload): Promise<DeliveryResult> {
  const { ttl = 3600, ...visiblePayload } = payload;
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh_key, auth: subscription.auth_key }
      },
      JSON.stringify(visiblePayload),
      { TTL: ttl }
    );
    return { ok: true, expired: false };
  } catch (error) {
    const pushError = error as PushError;
    return {
      ok: false,
      expired: pushError.statusCode === 404 || pushError.statusCode === 410,
      error: pushError.message || "Push provider rejected the notification."
    };
  }
}

async function preferenceMap(userIds: string[], type: NotificationType) {
  if (!userIds.length) return new Map<string, boolean>();
  const supabaseAdmin = createSupabaseAdmin();
  const preferenceColumn = type === "announcement" ? "announcements" : type;
  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .select(`user_id, ${preferenceColumn}`)
    .in("user_id", userIds);
  if (error) throw new Error("Could not load notification preferences.");

  const result = new Map<string, boolean>();
  for (const row of data || []) {
    const preference = row as unknown as Record<string, unknown>;
    result.set(String(preference.user_id), preference[preferenceColumn] !== false);
  }
  return result;
}

export async function countPushRecipients(type: NotificationType) {
  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id");
  if (error) throw new Error("Could not load push subscriptions.");

  const subscriptions = data || [];
  const preferences = await preferenceMap([...new Set(subscriptions.map(item => item.user_id))], type);
  const enabled = subscriptions.filter(item => preferences.get(item.user_id) !== false);
  return {
    users: new Set(enabled.map(item => item.user_id)).size,
    devices: enabled.length
  };
}

async function dispatchSummary(dispatchId: string): Promise<PushSendResult> {
  const supabaseAdmin = createSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("notification_deliveries")
    .select("status")
    .eq("dispatch_id", dispatchId);
  const statuses = (data || []).map(row => row.status);
  return {
    dispatchId,
    total: statuses.length,
    sent: statuses.filter(status => status === "sent").length,
    failed: statuses.filter(status => status === "failed").length,
    removed: statuses.filter(status => status === "expired").length,
    skipped: true
  };
}

export async function sendTrackedPush(args: {
  type: NotificationType;
  payload: PushPayload;
  gameId?: string;
  createdBy?: string;
  source?: "admin" | "scheduled";
  dedupeKey?: string;
  targetUserIds?: string[];
}): Promise<PushSendResult> {
  const supabaseAdmin = createSupabaseAdmin();
  const { payload } = args;
  const { data: dispatch, error: dispatchError } = await supabaseAdmin
    .from("notification_dispatches")
    .insert({
      notification_type: args.type,
      game_id: args.gameId || null,
      title: payload.title,
      body: payload.body,
      target_url: payload.url || "/",
      tag: payload.tag || null,
      source: args.source || "admin",
      dedupe_key: args.dedupeKey || null,
      created_by: args.createdBy || null
    })
    .select("id")
    .single();

  if (dispatchError) {
    if (dispatchError.code === "23505" && args.dedupeKey) {
      const { data: existing } = await supabaseAdmin
        .from("notification_dispatches")
        .select("id")
        .eq("dedupe_key", args.dedupeKey)
        .single();
      if (existing) return dispatchSummary(existing.id);
    }
    throw new Error("Could not create the notification delivery record.");
  }

  let subscriptionsQuery = supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh_key, auth_key");
  if (args.targetUserIds) {
    if (!args.targetUserIds.length) {
      return { dispatchId: dispatch.id, total: 0, sent: 0, failed: 0, removed: 0 };
    }
    subscriptionsQuery = subscriptionsQuery.in("user_id", args.targetUserIds);
  }

  const { data: subscriptionData, error: subscriptionError } = await subscriptionsQuery;
  if (subscriptionError) throw new Error("Could not load push subscriptions.");
  const subscriptions = (subscriptionData || []) as PushSubscriptionRow[];
  const preferences = await preferenceMap([...new Set(subscriptions.map(item => item.user_id))], args.type);
  const enabledSubscriptions = subscriptions.filter(item => preferences.get(item.user_id) !== false);

  if (!enabledSubscriptions.length) {
    return { dispatchId: dispatch.id, total: 0, sent: 0, failed: 0, removed: 0 };
  }

  const { data: deliveries, error: deliveryInsertError } = await supabaseAdmin
    .from("notification_deliveries")
    .insert(enabledSubscriptions.map(subscription => ({
      dispatch_id: dispatch.id,
      user_id: subscription.user_id,
      subscription_id: subscription.id
    })))
    .select("id, subscription_id");
  if (deliveryInsertError) throw new Error("Could not create notification delivery attempts.");

  const deliveryBySubscription = new Map((deliveries || []).map(row => [row.subscription_id, row.id]));
  let sent = 0;
  let failed = 0;
  let removed = 0;

  try {
    configureWebPush();
  } catch (error) {
    const failureMessage = error instanceof Error
      ? error.message
      : "Push service configuration failed.";
    const deliveryIds = (deliveries || []).map(row => row.id);
    const { error: updateError } = await supabaseAdmin
      .from("notification_deliveries")
      .update({
        status: "failed",
        attempt_count: 1,
        error_message: failureMessage,
        last_attempt_at: new Date().toISOString()
      })
      .in("id", deliveryIds);
    if (updateError) {
      console.error("Could not record push configuration failures", {
        dispatchId: dispatch.id,
        message: updateError.message
      });
    }
    return {
      dispatchId: dispatch.id,
      total: enabledSubscriptions.length,
      sent: 0,
      failed: enabledSubscriptions.length,
      removed: 0
    };
  }

  await Promise.all(enabledSubscriptions.map(async subscription => {
    const result = await deliverOne(subscription, payload);
    const status = result.ok ? "sent" : result.expired ? "expired" : "failed";
    if (result.ok) sent += 1;
    else if (result.expired) removed += 1;
    else failed += 1;

    await supabaseAdmin
      .from("notification_deliveries")
      .update({
        status,
        attempt_count: 1,
        error_message: result.error || null,
        last_attempt_at: new Date().toISOString()
      })
      .eq("id", deliveryBySubscription.get(subscription.id));

    if (result.expired) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("id", subscription.id);
    }
  }));

  return { dispatchId: dispatch.id, total: enabledSubscriptions.length, sent, failed, removed };
}

export async function retryFailedDispatch(dispatchId: string): Promise<PushSendResult> {
  const supabaseAdmin = createSupabaseAdmin();
  const { data: dispatch, error: dispatchError } = await supabaseAdmin
    .from("notification_dispatches")
    .select("id, notification_type, title, body, target_url, tag")
    .eq("id", dispatchId)
    .single();
  if (dispatchError || !dispatch) throw new Error("Notification dispatch not found.");

  const { data: failedRows, error: failedError } = await supabaseAdmin
    .from("notification_deliveries")
    .select("id, user_id, subscription_id, attempt_count")
    .eq("dispatch_id", dispatchId)
    .eq("status", "failed");
  if (failedError) throw new Error("Could not load failed deliveries.");
  if (!failedRows?.length) return { dispatchId, total: 0, sent: 0, failed: 0, removed: 0 };

  configureWebPush();
  const subscriptionIds = failedRows.flatMap(row => row.subscription_id ? [row.subscription_id] : []);
  const { data: subscriptionData, error: subscriptionError } = subscriptionIds.length
    ? await supabaseAdmin.from("push_subscriptions").select("id, user_id, endpoint, p256dh_key, auth_key").in("id", subscriptionIds)
    : { data: [], error: null };
  if (subscriptionError) throw new Error("Could not reload push subscriptions.");
  const subscriptions = (subscriptionData || []) as PushSubscriptionRow[];
  const subscriptionMap = new Map(subscriptions.map(subscription => [subscription.id, subscription]));
  const preferences = await preferenceMap([...new Set(failedRows.map(row => row.user_id))], dispatch.notification_type as NotificationType);
  const payload: PushPayload = { title: dispatch.title, body: dispatch.body, url: dispatch.target_url, tag: dispatch.tag || undefined };
  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(failedRows.map(async row => {
    const subscription = row.subscription_id ? subscriptionMap.get(row.subscription_id) : undefined;
    if (!subscription) {
      removed += 1;
      await supabaseAdmin.from("notification_deliveries").update({ status: "expired", error_message: "Subscription no longer exists." }).eq("id", row.id);
      return;
    }
    if (preferences.get(row.user_id) === false) {
      await supabaseAdmin.from("notification_deliveries").update({ status: "skipped", error_message: "Disabled in user preferences." }).eq("id", row.id);
      return;
    }

    const result = await deliverOne(subscription, payload);
    const status = result.ok ? "sent" : result.expired ? "expired" : "failed";
    if (result.ok) sent += 1;
    else if (result.expired) removed += 1;
    else failed += 1;
    await supabaseAdmin.from("notification_deliveries").update({
      status,
      attempt_count: row.attempt_count + 1,
      error_message: result.error || null,
      last_attempt_at: new Date().toISOString()
    }).eq("id", row.id);
    if (result.expired) await supabaseAdmin.from("push_subscriptions").delete().eq("id", subscription.id);
  }));

  return { dispatchId, total: failedRows.length, sent, failed, removed };
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  configureWebPush();
  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh_key, auth_key")
    .eq("user_id", userId);
  if (error) throw new Error("Could not load the user's push subscriptions.");

  const subscriptions = (data || []) as PushSubscriptionRow[];
  let sent = 0;
  let failed = 0;
  let removed = 0;
  await Promise.all(subscriptions.map(async subscription => {
    const result = await deliverOne(subscription, payload);
    if (result.ok) sent += 1;
    else if (result.expired) {
      removed += 1;
      await supabaseAdmin.from("push_subscriptions").delete().eq("id", subscription.id);
    } else failed += 1;
  }));
  return { total: subscriptions.length, sent, failed, removed };
}
