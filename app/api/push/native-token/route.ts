import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requestClientIdentifier, serverRateLimitDecision } from "@/lib/serverRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };
const expoTokenPattern = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{20,220}\]$/;
const installationPattern = /^[A-Za-z0-9_-]{16,128}$/;

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const supabaseAdmin = createSupabaseAdmin();
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(
    authorization.slice("Bearer ".length)
  );
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.account_status === "active" ? { user, supabaseAdmin } : null;
}

async function allowWrite(userId: string) {
  return serverRateLimitDecision({
    scope: "native-push-token-write",
    identifier: userId,
    maximumAttempts: 20,
    windowSeconds: 60
  });
}

async function allowAnonymousRemoval(request: Request, installationId: string) {
  return serverRateLimitDecision({
    scope: "native-push-token-remove",
    identifier: `${requestClientIdentifier(request)}:${installationId}`,
    maximumAttempts: 12,
    windowSeconds: 60
  });
}

export async function POST(request: Request) {
  const authentication = await authenticatedUser(request);
  if (!authentication) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStoreHeaders });
  }
  const limit = await allowWrite(authentication.user.id);
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.error }, { status: limit.status, headers: noStoreHeaders });
  }
  const body = await request.json().catch(() => null) as {
    expoPushToken?: unknown;
    platform?: unknown;
    installationId?: unknown;
    appVersion?: unknown;
  } | null;
  const expoPushToken = typeof body?.expoPushToken === "string" ? body.expoPushToken.trim() : "";
  const platform = body?.platform === "ios" || body?.platform === "android" ? body.platform : null;
  const installationId = typeof body?.installationId === "string" ? body.installationId.trim() : "";
  const appVersion = typeof body?.appVersion === "string" ? body.appVersion.trim().slice(0, 64) : null;
  if (!expoTokenPattern.test(expoPushToken) || !platform || !installationPattern.test(installationId)) {
    return NextResponse.json({ error: "Invalid native push token." }, { status: 400, headers: noStoreHeaders });
  }

  const admin = authentication.supabaseAdmin;
  const cleanupByToken = await admin.from("native_push_tokens").delete().eq("expo_push_token", expoPushToken);
  if (cleanupByToken.error) {
    return NextResponse.json({ error: "Could not register this device." }, { status: 500, headers: noStoreHeaders });
  }
  const cleanupByInstall = await admin
    .from("native_push_tokens")
    .delete()
    .eq("user_id", authentication.user.id)
    .eq("installation_id", installationId);
  if (cleanupByInstall.error) {
    return NextResponse.json({ error: "Could not register this device." }, { status: 500, headers: noStoreHeaders });
  }
  const { error } = await admin.from("native_push_tokens").insert({
    user_id: authentication.user.id,
    expo_push_token: expoPushToken,
    platform,
    installation_id: installationId,
    app_version: appVersion,
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  });
  if (error) {
    return NextResponse.json({ error: "Could not register this device." }, { status: 500, headers: noStoreHeaders });
  }
  return NextResponse.json({ success: true }, { headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const authentication = await authenticatedUser(request);
  const body = await request.json().catch(() => null) as { expoPushToken?: unknown; installationId?: unknown } | null;
  const expoPushToken = typeof body?.expoPushToken === "string" ? body.expoPushToken.trim() : "";
  const installationId = typeof body?.installationId === "string" ? body.installationId.trim() : "";
  if (!expoTokenPattern.test(expoPushToken) || !installationPattern.test(installationId)) {
    return NextResponse.json({ error: "Valid device details are required." }, { status: 400, headers: noStoreHeaders });
  }
  const limit = authentication
    ? await allowWrite(authentication.user.id)
    : await allowAnonymousRemoval(request, installationId);
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.error }, { status: limit.status, headers: noStoreHeaders });
  }
  const admin = authentication?.supabaseAdmin || createSupabaseAdmin();
  let deletion = admin
    .from("native_push_tokens")
    .delete()
    .eq("expo_push_token", expoPushToken)
    .eq("installation_id", installationId);
  if (authentication) deletion = deletion.eq("user_id", authentication.user.id);
  const { error } = await deletion;
  if (error) {
    return NextResponse.json({ error: "Could not disable notifications on this device." }, { status: 500, headers: noStoreHeaders });
  }
  return NextResponse.json({ success: true }, { headers: noStoreHeaders });
}
