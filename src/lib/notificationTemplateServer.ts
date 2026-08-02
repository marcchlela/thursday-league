import "server-only";

import {
  AutomaticNotificationType,
  defaultNotificationTemplate,
  isAutomaticNotificationType,
  NotificationTemplate,
  notificationDestinationUrl,
  renderNotificationText,
  validateNotificationTemplate
} from "./notificationTemplates";
import type { PushPayload } from "./pushNotifications";
import { createSupabaseAdmin } from "./supabaseAdmin";

type StoredTemplateRow = {
  notification_type: string;
  enabled: boolean;
  title_template: string;
  body_template: string;
  destination: string;
  updated_at?: string | null;
};

function fromStoredRow(row: StoredTemplateRow): NotificationTemplate | null {
  if (!isAutomaticNotificationType(row.notification_type)) return null;
  const parsed = validateNotificationTemplate({
    notificationType: row.notification_type,
    enabled: row.enabled,
    titleTemplate: row.title_template,
    bodyTemplate: row.body_template,
    destination: row.destination
  });
  return parsed.data ? { ...parsed.data, updatedAt: row.updated_at || null } : null;
}

export async function loadAutomaticNotificationTemplate(notificationType: AutomaticNotificationType) {
  const fallback = defaultNotificationTemplate(notificationType);
  try {
    const { data, error } = await createSupabaseAdmin()
      .from("platform_notification_templates")
      .select("notification_type, enabled, title_template, body_template, destination, updated_at")
      .eq("notification_type", notificationType)
      .maybeSingle();
    if (error) {
      console.error("Notification template load failed; using the safe default", {
        notificationType,
        code: error.code,
        message: error.message
      });
      return fallback;
    }
    return data ? fromStoredRow(data as StoredTemplateRow) || fallback : fallback;
  } catch (error) {
    console.error("Notification template service unavailable; using the safe default", {
      notificationType,
      error
    });
    return fallback;
  }
}

export async function automaticNotificationPayload(args: {
  notificationType: AutomaticNotificationType;
  template?: NotificationTemplate;
  values: Record<string, string | number>;
  leagueSlug: string;
  gameId?: string | null;
  tag: string;
  ttl: number;
}): Promise<PushPayload | null> {
  const template = args.template || await loadAutomaticNotificationTemplate(args.notificationType);
  if (!template.enabled) return null;
  const text = renderNotificationText(template, args.values);
  return {
    ...text,
    url: notificationDestinationUrl(template.destination, {
      leagueSlug: args.leagueSlug,
      gameId: args.gameId
    }),
    tag: args.tag,
    ttl: args.ttl
  };
}
