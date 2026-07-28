import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { serverRateLimitDecision } from "@/lib/serverRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = authorization.slice("Bearer ".length);
  const supabaseAdmin = createSupabaseAdmin();
  const authentication = await supabaseAdmin.auth.getUser(token);
  if (authentication.error || !authentication.data.user) {
    return NextResponse.json({ error: "Invalid authentication." }, { status: 401 });
  }

  const limit = await serverRateLimitDecision({
    scope: "account-delete",
    identifier: authentication.data.user.id,
    maximumAttempts: 3,
    windowSeconds: 60 * 60
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.error }, { status: limit.status });
  }

  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm account deletion." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const deletion = await userClient.rpc("delete_own_account", {
    delete_confirmation: body.confirmation
  });
  if (deletion.error) {
    return NextResponse.json({ error: deletion.error.message }, { status: 400 });
  }

  const result = deletion.data as { avatar_path?: string | null } | null;
  if (result?.avatar_path) {
    const cleanup = await supabaseAdmin.storage.from("profile-avatars").remove([result.avatar_path]);
    if (cleanup.error) {
      console.error("Deleted account avatar cleanup failed", cleanup.error.message);
    }
  }

  return NextResponse.json({ success: true });
}
