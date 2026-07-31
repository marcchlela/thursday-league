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

  const [{ data: profile }, { data: appRole }] = await Promise.all([
    supabaseAdmin.from("profiles").select("account_status").eq("id", user.id).single(),
    supabaseAdmin.from("app_roles").select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle()
  ]);
  if (profile?.account_status !== "active" || !appRole) return { ok: false as const, response: NextResponse.json({ error: "Platform admin access required." }, { status: 403 }) };
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
    const leagueId = new URL(request.url).searchParams.get("league");
    if (!leagueId) return NextResponse.json({ error: "Choose a league first." }, { status: 400 });
    const recipients = await countPushRecipients(leagueId, "announcement");
    return NextResponse.json({ success: true, recipients });
  } catch (error) {
    console.error("Announcement recipient count failed", error);
    return NextResponse.json({ error: "Could not count announcement recipients. Please try again." }, { status: 500 });
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

  const rawBody = await request.json().catch(() => null) as Record<string, unknown> | null;
  const leagueId = typeof rawBody?.leagueId === "string" ? rawBody.leagueId : "";
  if (!leagueId) return NextResponse.json({ error: "Choose a league first." }, { status: 400 });
  const { data: league } = await authentication.supabaseAdmin
    .from("leagues")
    .select("id, slug")
    .eq("id", leagueId)
    .eq("status", "active")
    .maybeSingle();
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });

  const parsed = validateCustomNotification(rawBody);
  if (parsed.error || !parsed.data) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const notification = parsed.data;

  if (notification.destination === "upcoming_game") {
    const { data: game } = await authentication.supabaseAdmin
      .from("games")
      .select("id")
      .eq("id", notification.gameId!)
      .eq("league_id", leagueId)
      .in("status", ["upcoming", "draft"])
      .gt("game_date", new Date().toISOString())
      .maybeSingle();
    if (!game) return NextResponse.json({ error: "That game is no longer upcoming." }, { status: 409 });
  }

  try {
    const result = await sendTrackedPush({
      leagueId,
      type: "announcement",
      gameId: notification.gameId || undefined,
      createdBy: authentication.userId,
      dedupeKey: `announcement:${notification.requestId}`,
      payload: {
        title: notification.title,
        body: notification.body,
        url: `/l/${league.slug}${customNotificationTarget(notification.destination, notification.gameId)}`,
        tag: `announcement-${notification.requestId}`,
        ttl: 86400
      }
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Announcement delivery failed", error);
    return NextResponse.json({ error: "Could not send the announcement. Please try again." }, { status: 500 });
  }
}
