import { NextResponse } from "next/server";
import {
  authEmailRedirect,
  isInternalAuthEmail,
  isValidUsername,
  normalizeUsername,
  parseAuthPlatform
} from "@/lib/authIdentity";
import {
  createServerAuthClient,
  noStoreJsonHeaders,
  resolveUsernameIdentity
} from "@/lib/serverAuth";
import { requestClientIdentifier, serverRateLimitDecision } from "@/lib/serverRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECOVERY_RESPONSE = "If that account has a verified recovery email, a reset link is on its way.";

function configuredAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl}` : "http://127.0.0.1:3000";
}

export async function POST(request: Request) {
  const headers = noStoreJsonHeaders();
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
  }

  const body = await request.json().catch(() => null) as {
    username?: unknown;
    platform?: unknown;
  } | null;
  const username = normalizeUsername(typeof body?.username === "string" ? body.username : "");
  const platform = parseAuthPlatform(body?.platform);
  if (!isValidUsername(username)) {
    return NextResponse.json({ message: RECOVERY_RESPONSE }, { status: 202, headers });
  }

  const [ipLimit, identityLimit] = await Promise.all([
    serverRateLimitDecision({
      scope: "password-recovery-ip",
      identifier: requestClientIdentifier(request),
      maximumAttempts: 5,
      windowSeconds: 60 * 60
    }),
    serverRateLimitDecision({
      scope: "password-recovery-identity",
      identifier: username,
      maximumAttempts: 3,
      windowSeconds: 60 * 60
    })
  ]);
  const denied = [ipLimit, identityLimit].find(result => !result.allowed);
  if (denied && !denied.allowed) {
    return NextResponse.json({ error: denied.error }, { status: denied.status, headers });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const identity = await resolveUsernameIdentity(username);
  if (
    supabaseUrl
    && identity?.accountStatus === "active"
    && !isInternalAuthEmail(identity.email, supabaseUrl)
  ) {
    const authClient = createServerAuthClient();
    const { error } = await authClient.auth.resetPasswordForEmail(identity.email, {
      redirectTo: authEmailRedirect({
        platform,
        flow: "recover-password",
        appUrl: configuredAppUrl()
      })
    });
    if (error) {
      console.error("Password recovery email failed", {
        userId: identity.id,
        code: error.code,
        status: error.status
      });
    }
  }

  return NextResponse.json({ message: RECOVERY_RESPONSE }, { status: 202, headers });
}
