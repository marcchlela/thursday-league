import { NextResponse } from "next/server";
import { customNotificationTarget, validateCustomNotification } from "@/lib/customNotifications";
import { countPushRecipients, sendTrackedPush } from "@/lib/pushNotifications";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { serverRateLimitDecision } from "@/lib/serverRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticateAdmin(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false as const, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const token = authorization.slice("Bearer ".length);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { ok: false as const, response: NextResponse.json({ error: "Invalid authentication." }, { status: 401 }) };

  const { data: profile } = await supabaseAdmin.from("profiles").select("is_admin, account_status").eq("id", user.id).single();
  if (!profile?.is_admin || profile.account_status !== "active") return { ok: false as const, response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  return { ok: true as const, supabaseAdmin, userId: user.id };
}

export async function GET(request: Request) {
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return authentication.response;

  const limit = await serverRateLimitDecision({
    scope: "push-custom-preview",
    identifier: authentication.userId,
    maximumAttempts: 30,
    windowSeconds: 60
  });
  if (!limit.allowed) return NextResponse.json({ error: limit.error }, { status: limit.status });

  try {
    const recipients = await countPushRecipients("announcement");
    return NextResponse.json({ success: true, recipients });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not count announcement recipients." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return authentication.response;

  const limit = await serverRateLimitDecision({
    scope: "push-custom",
    identifier: authentication.userId,
    maximumAttempts: 5,
    windowSeconds: 60
  });
  if (!limit.allowed) return NextResponse.json({ error: limit.error }, { status: limit.status });

  const parsed = validateCustomNotification(await request.json().catch(() => null));
  if (parsed.error || !parsed.data) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const notification = parsed.data;

  if (notification.destination === "upcoming_game") {
    const { data: game } = await authentication.supabaseAdmin
      .from("games")
      .select("id")
      .eq("id", notification.gameId!)
      .in("status", ["upcoming", "draft"])
      .gt("game_date", new Date().toISOString())
      .maybeSingle();
    if (!game) return NextResponse.json({ error: "That game is no longer upcoming." }, { status: 409 });
  }

  try {
    const result = await sendTrackedPush({
      type: "announcement",
      gameId: notification.gameId || undefined,
      createdBy: authentication.userId,
      dedupeKey: `announcement:${notification.requestId}`,
      payload: {
        title: notification.title,
        body: notification.body,
        url: customNotificationTarget(notification.destination, notification.gameId),
        tag: `announcement-${notification.requestId}`,
        ttl: 86400
      }
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send the announcement." }, { status: 500 });
  }
}
