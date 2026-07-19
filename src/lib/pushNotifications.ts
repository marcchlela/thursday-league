import "server-only";

import webPush from "web-push";
import { createSupabaseAdmin } from "./supabaseAdmin";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type PushError = Error & {
  statusCode?: number;
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

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
) {
  configureWebPush();

  const supabaseAdmin = createSupabaseAdmin();

  const { data: subscriptions, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh_key, auth_key")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Could not load push subscriptions.");
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    (subscriptions || []).map(async subscription => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh_key,
              auth: subscription.auth_key
            }
          },
          JSON.stringify(payload),
          {
            TTL: 60
          }
        );

        sent += 1;
      } catch (error) {
        failed += 1;

        const pushError = error as PushError;

        // These responses mean the browser subscription no longer exists.
        if (
          pushError.statusCode === 404 ||
          pushError.statusCode === 410
        ) {
          const { error: deleteError } = await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);

          if (!deleteError) removed += 1;
        }
      }
    })
  );

  return {
    total: subscriptions?.length || 0,
    sent,
    failed,
    removed
  };
}