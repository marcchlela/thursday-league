import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { friendlyActionError } from "@/lib/actionErrors";
import { automaticNotificationPayload } from "@/lib/notificationTemplateServer";
import { sendTrackedPush } from "@/lib/pushNotifications";
import { serverRateLimitDecision } from "@/lib/serverRateLimit";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MembershipRequest = {
  action?: unknown;
  code?: unknown;
  requestId?: unknown;
  approve?: unknown;
};

function userSupabaseClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Service configuration is incomplete.");
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = authorization.slice("Bearer ".length);
  const admin = createSupabaseAdmin();
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid authentication." }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("username, account_status")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "active") {
    return NextResponse.json({ error: "Account access is unavailable." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as MembershipRequest | null;
  if (!body || (body.action !== "request" && body.action !== "review")) {
    return NextResponse.json({ error: "Invalid membership action." }, { status: 400 });
  }

  const limit = await serverRateLimitDecision({
    scope: `league-membership-${body.action}`,
    identifier: user.id,
    maximumAttempts: body.action === "request" ? 8 : 20,
    windowSeconds: 60
  });
  if (!limit.allowed) return NextResponse.json({ error: limit.error }, { status: limit.status });

  let client;
  try {
    client = userSupabaseClient(token);
  } catch {
    return NextResponse.json({ error: "The service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }

  if (body.action === "request") {
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) return NextResponse.json({ error: "Enter a league code." }, { status: 400 });
    const mutation = await client.rpc("request_to_join_league", { submitted_code: code });
    if (mutation.error) {
      return NextResponse.json({
        error: friendlyActionError(mutation.error, "Your request could not be sent.")
      }, { status: 400 });
    }

    const result = mutation.data as {
      status: string;
      request_id?: string;
      league_id: string;
      league_name?: string;
      slug?: string;
    };
    if (result.status === "pending" && result.request_id) {
      const [{ data: league }, { data: adminRows }] = await Promise.all([
        admin.from("leagues").select("name, slug").eq("id", result.league_id).single(),
        admin
          .from("league_memberships")
          .select("user_id")
          .eq("league_id", result.league_id)
          .eq("status", "active")
          .in("role", ["owner", "admin"])
      ]);
      if (league) {
        try {
          const payload = await automaticNotificationPayload({
            notificationType: "join_request",
            values: { username: profile.username || "A player", league_name: league.name },
            leagueSlug: league.slug,
            tag: `join-request-${result.request_id}`,
            ttl: 86400
          });
          if (payload) {
            await sendTrackedPush({
              leagueId: result.league_id,
              type: "join_request",
              source: "scheduled",
              createdBy: user.id,
              dedupeKey: `join_request:${result.request_id}`,
              targetUserIds: (adminRows || []).map(row => row.user_id),
              payload
            });
          }
        } catch (error) {
          console.error("Join request notification failed", {
            requestId: result.request_id,
            error
          });
        }
      }
    }
    return NextResponse.json({ success: true, result });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const approve = body.approve === true;
  if (!requestId || typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "Choose a valid join request." }, { status: 400 });
  }
  const mutation = await client.rpc("review_league_join_request", {
    target_request_id: requestId,
    approve
  });
  if (mutation.error) {
    return NextResponse.json({
      error: friendlyActionError(mutation.error, "The request could not be reviewed.")
    }, { status: 400 });
  }

  const result = mutation.data as {
    status: "approved" | "rejected";
    league_id: string;
    slug: string;
    user_id: string;
  };
  if (result.status === "approved") {
    const { data: league } = await admin
      .from("leagues")
      .select("name, slug")
      .eq("id", result.league_id)
      .single();
    if (league) {
      try {
        const payload = await automaticNotificationPayload({
          notificationType: "join_approved",
          values: { admin_name: profile.username || "A league admin", league_name: league.name },
          leagueSlug: league.slug,
          tag: `join-approved-${requestId}`,
          ttl: 86400
        });
        if (payload) {
          await sendTrackedPush({
            leagueId: result.league_id,
            type: "join_approved",
            source: "scheduled",
            createdBy: user.id,
            dedupeKey: `join_approved:${requestId}`,
            targetUserIds: [result.user_id],
            payload
          });
        }
      } catch (error) {
        console.error("Join approval notification failed", { requestId, error });
      }
    }
  }

  return NextResponse.json({ success: true, result });
}
