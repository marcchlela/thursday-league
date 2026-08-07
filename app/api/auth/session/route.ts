import { NextResponse } from "next/server";
import {
  isValidEmail,
  isValidUsername,
  MAXIMUM_PASSWORD_LENGTH,
  MINIMUM_PASSWORD_LENGTH,
  normalizeEmail,
  normalizeUsername
} from "@/lib/authIdentity";
import {
  createServerAuthClient,
  noStoreJsonHeaders,
  publicSession,
  resolveUsernameIdentity
} from "@/lib/serverAuth";
import { requestClientIdentifier, serverRateLimitDecision } from "@/lib/serverRateLimit";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_CREDENTIALS = "Username/email or password is incorrect.";

export async function POST(request: Request) {
  const headers = noStoreJsonHeaders();
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
  }

  const body = await request.json().catch(() => null) as {
    identity?: unknown;
    username?: unknown;
    password?: unknown;
  } | null;
  const submittedIdentity = typeof body?.identity === "string"
    ? body.identity
    : typeof body?.username === "string"
      ? body.username
      : "";
  const emailLogin = submittedIdentity.includes("@");
  const identityValue = emailLogin
    ? normalizeEmail(submittedIdentity)
    : normalizeUsername(submittedIdentity);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!(emailLogin ? isValidEmail(identityValue) : isValidUsername(identityValue))
    || password.length < MINIMUM_PASSWORD_LENGTH
    || password.length > MAXIMUM_PASSWORD_LENGTH) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401, headers });
  }

  const [ipLimit, identityLimit] = await Promise.all([
    serverRateLimitDecision({
      scope: "login-ip",
      identifier: requestClientIdentifier(request),
      maximumAttempts: 20,
      windowSeconds: 15 * 60
    }),
    serverRateLimitDecision({
      scope: "login-identity",
      identifier: identityValue,
      maximumAttempts: 8,
      windowSeconds: 15 * 60
    })
  ]);
  const denied = [ipLimit, identityLimit].find(result => !result.allowed);
  if (denied && !denied.allowed) {
    return NextResponse.json({ error: denied.error }, { status: denied.status, headers });
  }

  const resolved = emailLogin ? null : await resolveUsernameIdentity(identityValue);
  const loginEmail = emailLogin ? identityValue : resolved?.email;
  if (!loginEmail) return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401, headers });

  const authClient = createServerAuthClient();
  const { data, error } = await authClient.auth.signInWithPassword({
    email: loginEmail,
    password
  });
  if (error || !data.session) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401, headers });
  }
  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("account_status")
    .eq("id", data.session.user.id)
    .maybeSingle();
  if (profile?.account_status !== "active") {
    await authClient.auth.signOut();
    return NextResponse.json({ error: "Account access is unavailable." }, { status: 403, headers });
  }

  return NextResponse.json({ session: publicSession(data.session) }, { headers });
}
