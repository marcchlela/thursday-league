import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  consumeServerRateLimit,
  RateLimitUnavailableError,
  requestClientIdentifier
} from "@/lib/serverRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERNAME_PATTERN = /^[a-z0-9_]{2,32}$/;

function inviteCodesMatch(received: string, expected: string) {
  const receivedHash = createHash("sha256").update(received).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

function internalEmail(username: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) throw new Error("Supabase is not configured.");
  return `${username}@${new URL(configuredUrl).hostname}`;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  try {
    const allowed = await consumeServerRateLimit({
      scope: "signup",
      identifier: requestClientIdentifier(request),
      maximumAttempts: 5,
      windowSeconds: 15 * 60
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Wait 15 minutes and try again." },
        { status: 429 }
      );
    }
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      return NextResponse.json(
        { error: "Signup is temporarily unavailable." },
        { status: 503 }
      );
    }
    throw error;
  }

  const body = await request.json().catch(() => null) as {
    username?: unknown;
    password?: unknown;
    inviteCode?: unknown;
  } | null;
  const username = typeof body?.username === "string"
    ? body.username.trim().toLowerCase()
    : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const receivedInviteCode = typeof body?.inviteCode === "string"
    ? body.inviteCode.trim()
    : "";
  const expectedInviteCode = process.env.LEAGUE_INVITE_CODE?.trim() || "";

  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      { error: "Username must contain 2–32 lowercase letters, numbers, or underscores." },
      { status: 400 }
    );
  }
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must contain between 8 and 128 characters." },
      { status: 400 }
    );
  }
  if (!expectedInviteCode) {
    return NextResponse.json(
      { error: "Signup is not configured. Contact the app administrator." },
      { status: 503 }
    );
  }
  if (!inviteCodesMatch(receivedInviteCode, expectedInviteCode)) {
    return NextResponse.json({ error: "Invite code is not valid." }, { status: 403 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: internalEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (error) {
    console.error("Server-side signup failed", { message: error.message });
    return NextResponse.json(
      { error: "That account could not be created. Try another username." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
