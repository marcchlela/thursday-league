import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser } from "@/lib/pushNotifications";

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

  const result = await sendPushToUser(user.id, {
    title: "",
    body: "Push notifications are working on this device!",
    url: "/settings",
    tag: "push-test"
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