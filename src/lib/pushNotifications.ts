import "server-only";

import webPush from "web-push";
import { createSupabaseAdmin } from "./supabaseAdmin";

export type NotificationType =
  | "new_game"
  | "lineups_ready"
  | "final_results"
  | "fantasy_deadline"
  | "announcement"
  | "join_request"
  | "join_approved"
  | "betting_unlocked"
  | "matchday_reminder";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  ttl?: number;
};

type WebTarget = {
  kind: "web";
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

type NativeTarget = {
  kind: "native";
  id: string;
  user_id: string;
  expo_push_token: string;
};

type PushTarget = WebTarget | NativeTarget;
type PushError = Error & { statusCode?: number };
type DeliveryResult = { ok: boolean; expired: boolean; error?: string; ticketId?: string };
type ExpoReceipt = { status?: string; message?: string; details?: { error?: string } };

export function classifyExpoReceipt(receipt: ExpoReceipt) {
  const providerError = receipt.details?.error;
  if (receipt.status === "ok") return { status: "sent" as const, expired: false, error: null };
  const expired = providerError === "DeviceNotRegistered";
  return {
    status: expired ? "expired" as const : "failed" as const,
    expired,
    error: receipt.message || providerError || "Native push provider rejected the notification."
  };
}

export type PushSendResult = {
  dispatchId?: string;
  total: number;
  sent: number;
  failed: number;
  removed: number;
  skipped?: boolean;
};

let webPushConfigured = false;

function configureWebPush() {
  if (webPushConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID configuration is incomplete.");
  webPush.setVapidDetails(subject, publicKey, privateKey);
  webPushConfigured = true;
}

async function deliverWeb(target: WebTarget, payload: PushPayload): Promise<DeliveryResult> {
  const { ttl = 3600, ...visiblePayload } = payload;
  try {
    configureWebPush();
    await webPush.sendNotification({
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh_key, auth: target.auth_key }
    }, JSON.stringify(visiblePayload), { TTL: ttl });
    return { ok: true, expired: false };
  } catch (error) {
    const pushError = error as PushError;
    return {
      ok: false,
      expired: pushError.statusCode === 404 || pushError.statusCode === 410,
      error: pushError.message || "Web Push rejected the notification."
    };
  }
}

async function deliverNative(target: NativeTarget, payload: PushPayload): Promise<DeliveryResult> {
  try {
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        to: target.expo_push_token,
        title: payload.title,
        body: payload.body,
        sound: "default",
        priority: "high",
        ttl: payload.ttl ?? 3600,
        channelId: "matchweek",
        collapseId: payload.tag,
        data: { url: payload.url || "/", tag: payload.tag || null }
      }),
      signal: AbortSignal.timeout(12_000)
    });
    const result = await response.json().catch(() => null) as {
      data?: { status?: string; id?: string; message?: string; details?: { error?: string } };
      errors?: Array<{ message?: string }>;
    } | null;
    const ticket = result?.data;
    if (response.ok && ticket?.status === "ok") return { ok: true, expired: false, ticketId: typeof ticket.id === "string" ? ticket.id : undefined };
    const providerError = ticket?.details?.error;
    return {
      ok: false,
      expired: providerError === "DeviceNotRegistered",
      error: ticket?.message || result?.errors?.[0]?.message || `Expo Push returned ${response.status}.`
    };
  } catch (error) {
    return {
      ok: false,
      expired: false,
      error: error instanceof Error ? error.message : "Expo Push could not be reached."
    };
  }
}

async function runWithConcurrency<T>(items: T[], maximum: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(maximum, items.length) }, run));
}

function deliverTarget(target: PushTarget, payload: PushPayload) {
  return target.kind === "web" ? deliverWeb(target, payload) : deliverNative(target, payload);
}

function targetKey(target: PushTarget) {
  return `${target.kind}:${target.id}`;
}

async function loadTargets(userIds: string[]): Promise<PushTarget[]> {
  if (!userIds.length) return [];
  const admin = createSupabaseAdmin();
  const [webResult, nativeResult] = await Promise.all([
    admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh_key, auth_key").in("user_id", userIds),
    admin.from("native_push_tokens").select("id, user_id, expo_push_token").in("user_id", userIds)
  ]);
  if (webResult.error || nativeResult.error) throw new Error("Could not load push devices.");
  return [
    ...((webResult.data || []) as Omit<WebTarget, "kind">[]).map(target => ({ ...target, kind: "web" as const })),
    ...((nativeResult.data || []) as Omit<NativeTarget, "kind">[]).map(target => ({ ...target, kind: "native" as const }))
  ];
}

async function removeExpiredTarget(target: PushTarget) {
  const admin = createSupabaseAdmin();
  await admin.from(target.kind === "web" ? "push_subscriptions" : "native_push_tokens").delete().eq("id", target.id);
}

async function preferenceMap(leagueId: string, userIds: string[], type: NotificationType) {
  if (!userIds.length) return new Map<string, boolean>();
  const admin = createSupabaseAdmin();
  const preferenceColumn = type === "announcement" ? "announcements" : type;
  const { data, error } = await admin
    .from("notification_preferences")
    .select(`user_id, ${preferenceColumn}`)
    .eq("league_id", leagueId)
    .in("user_id", userIds);
  if (error) throw new Error("Could not load notification preferences.");
  const result = new Map<string, boolean>();
  for (const row of data || []) {
    const preference = row as unknown as Record<string, unknown>;
    result.set(String(preference.user_id), preference[preferenceColumn] !== false);
  }
  return result;
}

export async function countPushRecipients(leagueId: string, type: NotificationType) {
  const admin = createSupabaseAdmin();
  const { data: memberRows, error } = await admin
    .from("league_memberships")
    .select("user_id")
    .eq("league_id", leagueId)
    .eq("status", "active");
  if (error) throw new Error("Could not load league members.");
  const targets = await loadTargets((memberRows || []).map(row => row.user_id));
  const preferences = await preferenceMap(leagueId, [...new Set(targets.map(target => target.user_id))], type);
  const enabled = targets.filter(target => preferences.get(target.user_id) !== false);
  return { users: new Set(enabled.map(target => target.user_id)).size, devices: enabled.length };
}

async function dispatchSummary(dispatchId: string): Promise<PushSendResult> {
  const { data } = await createSupabaseAdmin().from("notification_deliveries").select("status").eq("dispatch_id", dispatchId);
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
  leagueId: string;
  type: NotificationType;
  payload: PushPayload;
  gameId?: string;
  createdBy?: string;
  source?: "admin" | "scheduled";
  dedupeKey?: string;
  targetUserIds?: string[];
}): Promise<PushSendResult> {
  const admin = createSupabaseAdmin();
  const { payload } = args;
  const { data: dispatch, error: dispatchError } = await admin.from("notification_dispatches").insert({
    league_id: args.leagueId,
    notification_type: args.type,
    game_id: args.gameId || null,
    title: payload.title,
    body: payload.body,
    target_url: payload.url || "/",
    tag: payload.tag || null,
    source: args.source || "admin",
    dedupe_key: args.dedupeKey || null,
    created_by: args.createdBy || null
  }).select("id").single();
  if (dispatchError) {
    if (dispatchError.code === "23505" && args.dedupeKey) {
      const { data: existing } = await admin.from("notification_dispatches").select("id")
        .eq("league_id", args.leagueId).eq("dedupe_key", args.dedupeKey).single();
      if (existing) return dispatchSummary(existing.id);
    }
    throw new Error("Could not create the notification delivery record.");
  }

  const { data: memberRows, error: memberError } = await admin.from("league_memberships")
    .select("user_id").eq("league_id", args.leagueId).eq("status", "active");
  if (memberError) throw new Error("Could not load league notification recipients.");
  const activeMemberIds = new Set((memberRows || []).map(row => row.user_id));
  const requestedUserIds = args.targetUserIds
    ? args.targetUserIds.filter(userId => activeMemberIds.has(userId))
    : [...activeMemberIds];
  const targets = await loadTargets(requestedUserIds);
  const preferences = await preferenceMap(args.leagueId, [...new Set(targets.map(target => target.user_id))], args.type);
  const enabledTargets = targets.filter(target => preferences.get(target.user_id) !== false);
  if (!enabledTargets.length) return { dispatchId: dispatch.id, total: 0, sent: 0, failed: 0, removed: 0 };

  const { data: deliveries, error: deliveryError } = await admin.from("notification_deliveries").insert(
    enabledTargets.map(target => ({
      league_id: args.leagueId,
      dispatch_id: dispatch.id,
      user_id: target.user_id,
      subscription_id: target.kind === "web" ? target.id : null,
      native_push_token_id: target.kind === "native" ? target.id : null
    }))
  ).select("id, subscription_id, native_push_token_id");
  if (deliveryError) throw new Error("Could not create notification delivery attempts.");
  const deliveryMap = new Map((deliveries || []).map(row => [
    row.subscription_id ? `web:${row.subscription_id}` : `native:${row.native_push_token_id}`,
    row.id
  ]));

  let sent = 0;
  let failed = 0;
  let removed = 0;
  await runWithConcurrency(enabledTargets, 6, async target => {
    const result = await deliverTarget(target, payload);
    const status = result.ok ? "sent" : result.expired ? "expired" : "failed";
    if (result.ok) sent += 1;
    else if (result.expired) removed += 1;
    else failed += 1;
    await admin.from("notification_deliveries").update({
      status,
      attempt_count: 1,
      error_message: result.error || null,
      provider_ticket_id: result.ticketId || null,
      provider_receipt_checked_at: null,
      last_attempt_at: new Date().toISOString()
    }).eq("id", deliveryMap.get(targetKey(target)));
    if (result.expired) await removeExpiredTarget(target);
  });
  return { dispatchId: dispatch.id, total: enabledTargets.length, sent, failed, removed };
}

export async function retryFailedDispatch(
  dispatchId: string,
  options: { automatic?: boolean; now?: Date } = {}
): Promise<PushSendResult> {
  const admin = createSupabaseAdmin();
  const { data: dispatch, error: dispatchError } = await admin.from("notification_dispatches")
    .select("id, league_id, notification_type, title, body, target_url, tag").eq("id", dispatchId).single();
  if (dispatchError || !dispatch) throw new Error("Notification dispatch not found.");
  if (dispatch.notification_type !== "announcement") throw new Error("Only failed custom announcements can be retried.");
  const { data: failedRows, error: failedError } = await admin.from("notification_deliveries")
    .select("id, user_id, subscription_id, native_push_token_id, attempt_count, last_attempt_at")
    .eq("dispatch_id", dispatchId).eq("status", "failed");
  if (failedError) throw new Error("Could not load failed deliveries.");
  const now = options.now || new Date();
  const eligibleRows = (failedRows || []).filter(row => {
    const maximumAttempts = options.automatic ? 3 : 5;
    if (row.attempt_count >= maximumAttempts) return false;
    if (!options.automatic || !row.last_attempt_at) return true;
    const retryDelayMinutes = row.attempt_count <= 1 ? 10 : 30;
    return now.getTime() - new Date(row.last_attempt_at).getTime() >= retryDelayMinutes * 60_000;
  });
  if (!eligibleRows.length) return { dispatchId, total: 0, sent: 0, failed: 0, removed: 0, skipped: true };

  const webIds = eligibleRows.flatMap(row => row.subscription_id ? [row.subscription_id] : []);
  const nativeIds = eligibleRows.flatMap(row => row.native_push_token_id ? [row.native_push_token_id] : []);
  const [webResult, nativeResult] = await Promise.all([
    webIds.length ? admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh_key, auth_key").in("id", webIds) : Promise.resolve({ data: [], error: null }),
    nativeIds.length ? admin.from("native_push_tokens").select("id, user_id, expo_push_token").in("id", nativeIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (webResult.error || nativeResult.error) throw new Error("Could not reload push devices.");
  const targets: PushTarget[] = [
    ...((webResult.data || []) as Omit<WebTarget, "kind">[]).map(target => ({ ...target, kind: "web" as const })),
    ...((nativeResult.data || []) as Omit<NativeTarget, "kind">[]).map(target => ({ ...target, kind: "native" as const }))
  ];
  const targetMap = new Map(targets.map(target => [targetKey(target), target]));
  const preferences = await preferenceMap(dispatch.league_id, [...new Set(eligibleRows.map(row => row.user_id))], dispatch.notification_type as NotificationType);
  const payload: PushPayload = { title: dispatch.title, body: dispatch.body, url: dispatch.target_url, tag: dispatch.tag || undefined };
  let sent = 0;
  let failed = 0;
  let removed = 0;
  await runWithConcurrency(eligibleRows, 6, async row => {
    const key = row.subscription_id ? `web:${row.subscription_id}` : `native:${row.native_push_token_id}`;
    const target = targetMap.get(key);
    if (!target) {
      removed += 1;
      await admin.from("notification_deliveries").update({ status: "expired", error_message: "Push device no longer exists." }).eq("id", row.id);
      return;
    }
    if (preferences.get(row.user_id) === false) {
      await admin.from("notification_deliveries").update({ status: "skipped", error_message: "Disabled in user preferences." }).eq("id", row.id);
      return;
    }
    const result = await deliverTarget(target, payload);
    const status = result.ok ? "sent" : result.expired ? "expired" : "failed";
    if (result.ok) sent += 1;
    else if (result.expired) removed += 1;
    else failed += 1;
    await admin.from("notification_deliveries").update({
      status,
      attempt_count: row.attempt_count + 1,
      error_message: result.error || null,
      provider_ticket_id: result.ticketId || null,
      provider_receipt_checked_at: null,
      last_attempt_at: new Date().toISOString()
    }).eq("id", row.id);
    if (result.expired) await removeExpiredTarget(target);
  });
  return { dispatchId, total: eligibleRows.length, sent, failed, removed };
}

export async function retryFailedCustomDispatches(now = new Date()) {
  const admin = createSupabaseAdmin();
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await admin.from("notification_dispatches")
    .select("id, notification_deliveries!notification_deliveries_league_dispatch_fkey!inner(id)")
    .eq("notification_type", "announcement")
    .eq("notification_deliveries.status", "failed")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(25);
  if (error) throw new Error("Could not load failed custom announcements.");
  const results: PushSendResult[] = [];
  for (const dispatch of data || []) {
    const result = await retryFailedDispatch(dispatch.id, { automatic: true, now });
    if (!result.skipped || result.total) results.push(result);
  }
  return results;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const targets = await loadTargets([userId]);
  let sent = 0;
  let failed = 0;
  let removed = 0;
  await runWithConcurrency(targets, 6, async target => {
    const result = await deliverTarget(target, payload);
    if (result.ok) sent += 1;
    else if (result.expired) {
      removed += 1;
      await removeExpiredTarget(target);
    } else failed += 1;
  });
  return { total: targets.length, sent, failed, removed };
}

export async function reconcileNativePushReceipts(now = new Date()) {
  const admin = createSupabaseAdmin();
  const readyBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
  const expiresAfter = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const { data: candidates, error } = await admin
    .from("notification_deliveries")
    .select("id, native_push_token_id, provider_ticket_id, last_attempt_at")
    .eq("status", "sent")
    .not("provider_ticket_id", "is", null)
    .is("provider_receipt_checked_at", null)
    .lte("last_attempt_at", readyBefore)
    .gte("last_attempt_at", expiresAfter)
    .limit(1000);
  if (error) throw new Error("Could not load pending native push receipts.");

  const rows = (candidates || []).filter(row => row.provider_ticket_id && row.native_push_token_id);
  if (!rows.length) return { checked: 0, accepted: 0, failed: 0, removed: 0, pending: 0 };

  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify({ ids: rows.map(row => row.provider_ticket_id) }),
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => null) as {
    data?: Record<string, ExpoReceipt>;
    errors?: Array<{ message?: string }>;
  } | null;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message || `Expo Push receipts returned ${response.status}.`);
  }

  let accepted = 0;
  let failed = 0;
  let removed = 0;
  let pending = 0;
  for (const row of rows) {
    const receipt = payload.data[row.provider_ticket_id];
    if (!receipt) {
      pending += 1;
      continue;
    }
    const outcome = classifyExpoReceipt(receipt);
    const { expired, status } = outcome;
    if (status === "sent") accepted += 1;
    else if (expired) removed += 1;
    else failed += 1;
    await admin.from("notification_deliveries").update({
      status,
      error_message: outcome.error,
      provider_receipt_checked_at: now.toISOString()
    }).eq("id", row.id);
    if (expired) await admin.from("native_push_tokens").delete().eq("id", row.native_push_token_id);
  }

  await admin.from("notification_deliveries").update({
    status: "failed",
    provider_receipt_checked_at: now.toISOString(),
    error_message: "Expo Push receipt was no longer available."
  }).eq("status", "sent")
    .not("provider_ticket_id", "is", null)
    .is("provider_receipt_checked_at", null)
    .lt("last_attempt_at", expiresAfter);

  return { checked: rows.length - pending, accepted, failed, removed, pending };
}
