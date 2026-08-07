import { NextResponse } from "next/server";
import {
  AUTOMATIC_NOTIFICATION_TYPES,
  defaultNotificationTemplate,
  isAutomaticNotificationType,
  NotificationTemplate,
  validateNotificationTemplate
} from "@/lib/notificationTemplates";
import { serverRateLimitDecision } from "@/lib/serverRateLimit";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TemplateRow = {
  notification_type: string;
  enabled: boolean;
  title_template: string;
  body_template: string;
  destination: string;
  updated_at: string | null;
};

async function authenticatePlatformOwner(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false as const, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const admin = createSupabaseAdmin();
  const token = authorization.slice("Bearer ".length);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "Invalid authentication." }, { status: 401 }) };
  }

  const [{ data: profile }, { data: role }] = await Promise.all([
    admin.from("profiles").select("account_status").eq("id", user.id).maybeSingle(),
    admin.from("app_roles").select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle()
  ]);
  if (profile?.account_status !== "active" || !role) {
    return { ok: false as const, response: NextResponse.json({ error: "Platform owner access required." }, { status: 403 }) };
  }
  return { ok: true as const, admin, userId: user.id };
}

function serializeRow(row: TemplateRow): NotificationTemplate | null {
  const parsed = validateNotificationTemplate({
    notificationType: row.notification_type,
    enabled: row.enabled,
    titleTemplate: row.title_template,
    bodyTemplate: row.body_template,
    destination: row.destination
  });
  return parsed.data ? { ...parsed.data, updatedAt: row.updated_at } : null;
}

export async function GET(request: Request) {
  const authentication = await authenticatePlatformOwner(request);
  if (!authentication.ok) return authentication.response;

  const limit = await serverRateLimitDecision({
    scope: "platform-notification-templates-read",
    identifier: authentication.userId,
    maximumAttempts: 60,
    windowSeconds: 60
  });
  if (!limit.allowed) return NextResponse.json({ error: limit.error }, { status: limit.status });

  const { data, error } = await authentication.admin
    .from("platform_notification_templates")
    .select("notification_type, enabled, title_template, body_template, destination, updated_at");
  if (error) {
    console.error("Platform notification templates could not be loaded", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Notification templates are temporarily unavailable." }, { status: 503 });
  }

  const rows = new Map((data || []).map(row => [row.notification_type, serializeRow(row as TemplateRow)]));
  const templates = AUTOMATIC_NOTIFICATION_TYPES.map(notificationType => rows.get(notificationType) || defaultNotificationTemplate(notificationType));
  return NextResponse.json({ success: true, templates });
}

export async function PATCH(request: Request) {
  const authentication = await authenticatePlatformOwner(request);
  if (!authentication.ok) return authentication.response;

  const limit = await serverRateLimitDecision({
    scope: "platform-notification-templates-write",
    identifier: authentication.userId,
    maximumAttempts: 20,
    windowSeconds: 60
  });
  if (!limit.allowed) return NextResponse.json({ error: limit.error }, { status: limit.status });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const requestedType = body?.notificationType;
  if (!isAutomaticNotificationType(requestedType)) {
    return NextResponse.json({ error: "Choose a valid notification type." }, { status: 400 });
  }

  const candidate = body?.reset === true
    ? defaultNotificationTemplate(requestedType)
    : body;
  const parsed = validateNotificationTemplate(candidate);
  if (!parsed.data || parsed.error) {
    return NextResponse.json({ error: parsed.error || "Invalid notification template." }, { status: 400 });
  }

  const template = parsed.data;
  const { data, error } = await authentication.admin
    .from("platform_notification_templates")
    .upsert({
      notification_type: template.notificationType,
      enabled: template.enabled,
      title_template: template.titleTemplate,
      body_template: template.bodyTemplate,
      destination: template.destination,
      updated_by: authentication.userId
    }, { onConflict: "notification_type" })
    .select("notification_type, enabled, title_template, body_template, destination, updated_at")
    .single();
  if (error || !data) {
    console.error("Platform notification template update failed", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "The notification template could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ success: true, template: serializeRow(data as TemplateRow) });
}
