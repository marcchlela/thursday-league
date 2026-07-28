import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser } from "@/lib/pushNotifications";
import { serverRateLimitDecision } from "@/lib/serverRateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const token = authorization.slice("Bearer ".length);
  const supabaseAdmin = createSupabaseAdmin();

  const {
    data: { user },
    error
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json(
      { error: "Invalid authentication." },
      { status: 401 }
    );
  }
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "active") {
    return NextResponse.json({ error: "Account is not active." }, { status: 403 });
  }

  const limit = await serverRateLimitDecision({
    scope: "push-test",
    identifier: user.id,
    maximumAttempts: 3,
    windowSeconds: 60
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.error }, { status: limit.status });
  }

  const result = await sendPushToUser(user.id, {
    title: "Test",
    body: "Notifications are working correctly on this device!",
    url: "/settings",
    tag: "push-test",
    ttl: 60
  });

  if (result.total === 0) {
    return NextResponse.json(
      { error: "No notification subscription was found." },
      { status: 404 }
    );
  }

  if (result.sent === 0) {
    return NextResponse.json(
      { error: "The test notification could not be delivered." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    result
  });
}
