import { NextResponse } from "next/server";
import { retryFailedDispatch } from "@/lib/pushNotifications";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { serverRateLimitDecision } from "@/lib/serverRateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = authorization.slice("Bearer ".length);
  const supabaseAdmin = createSupabaseAdmin();
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Invalid authentication." }, { status: 401 });

  const [{ data: profile }, { data: appRole }] = await Promise.all([
    supabaseAdmin.from("profiles").select("account_status").eq("id", user.id).single(),
    supabaseAdmin.from("app_roles").select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle()
  ]);
  if (profile?.account_status !== "active" || !appRole) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });

  const limit = await serverRateLimitDecision({
    scope: "push-retry",
    identifier: user.id,
    maximumAttempts: 10,
    windowSeconds: 60
  });
  if (!limit.allowed) return NextResponse.json({ error: limit.error }, { status: limit.status });

  const body = await request.json().catch(() => null) as { dispatchId?: unknown } | null;
  const dispatchId = typeof body?.dispatchId === "string" ? body.dispatchId : "";
  if (!dispatchId) return NextResponse.json({ error: "A notification dispatch is required." }, { status: 400 });

  try {
    const result = await retryFailedDispatch(dispatchId);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Notification retry failed", error);
    return NextResponse.json({ error: "The notification retry failed. Please try again." }, { status: 500 });
  }
}
