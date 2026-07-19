import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length);
  const supabaseAdmin = createSupabaseAdmin();
  const {
    data: { user },
    error
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) return null;

  return {
    user,
    supabaseAdmin
  };
}

export async function POST(request: Request) {
  const authentication = await authenticatedUser(request);

  if (!authentication) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body: SubscriptionBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const endpoint =
    typeof body.endpoint === "string" ? body.endpoint : "";

  const p256dhKey =
    typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";

  const authKey =
    typeof body.keys?.auth === "string" ? body.keys.auth : "";

  if (!endpoint || !p256dhKey || !authKey) {
    return NextResponse.json(
      { error: "Invalid push subscription." },
      { status: 400 }
    );
  }

  try {
    const endpointUrl = new URL(endpoint);

    if (endpointUrl.protocol !== "https:") {
      throw new Error("Push endpoints must use HTTPS.");
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid push endpoint." },
      { status: 400 }
    );
  }

  const { error } = await authentication.supabaseAdmin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: authentication.user.id,
        endpoint,
        p256dh_key: p256dhKey,
        auth_key: authKey,
        user_agent: request.headers.get("user-agent"),
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "endpoint"
      }
    );

  if (error) {
    return NextResponse.json(
      { error: "Could not save the push subscription." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const authentication = await authenticatedUser(request);

  if (!authentication) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body: { endpoint?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const endpoint =
    typeof body.endpoint === "string" ? body.endpoint : "";

  if (!endpoint) {
    return NextResponse.json(
      { error: "Push endpoint is required." },
      { status: 400 }
    );
  }

  const { error } = await authentication.supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", authentication.user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json(
      { error: "Could not remove the push subscription." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}