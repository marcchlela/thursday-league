import { NextResponse } from "next/server";
import {
  authEmailRedirect,
  internalEmailForUsername,
  isValidEmail,
  isValidUsername,
  MAXIMUM_PASSWORD_LENGTH,
  MINIMUM_PASSWORD_LENGTH,
  normalizeEmail,
  normalizeUsername,
  parseAuthPlatform
} from "@/lib/authIdentity";
import {
  createServerAuthClient,
  noStoreJsonHeaders,
  publicSession
} from "@/lib/serverAuth";
import {
  consumeServerRateLimit,
  RateLimitUnavailableError,
  requestClientIdentifier
} from "@/lib/serverRateLimit";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl}` : "http://127.0.0.1:3000";
}

async function signupAllowed(request: Request, username: string, email: string) {
  const attempts = await Promise.all([
    consumeServerRateLimit({
      scope: "signup-ip",
      identifier: requestClientIdentifier(request),
      maximumAttempts: 5,
      windowSeconds: 15 * 60
    }),
    consumeServerRateLimit({
      scope: "signup-identity",
      identifier: `${username}:${email}`,
      maximumAttempts: 3,
      windowSeconds: 30 * 60
    })
  ]);
  return attempts.every(Boolean);
}

export async function POST(request: Request) {
  const headers = noStoreJsonHeaders();
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8192) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
  }

  const body = await request.json().catch(() => null) as {
    username?: unknown;
    email?: unknown;
    password?: unknown;
    platform?: unknown;
  } | null;
  const username = normalizeUsername(typeof body?.username === "string" ? body.username : "");
  const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
  const password = typeof body?.password === "string" ? body.password : "";
  const platform = parseAuthPlatform(body?.platform);

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "Username must contain 2-32 lowercase letters, numbers, or underscores." },
      { status: 400, headers }
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers });
  }
  if (password.length < MINIMUM_PASSWORD_LENGTH || password.length > MAXIMUM_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must contain between ${MINIMUM_PASSWORD_LENGTH} and ${MAXIMUM_PASSWORD_LENGTH} characters.` },
      { status: 400, headers }
    );
  }

  try {
    if (!await signupAllowed(request, username, email)) {
      return NextResponse.json(
        { error: "Too many signup attempts. Wait 15 minutes and try again." },
        { status: 429, headers }
      );
    }
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      return NextResponse.json({ error: "Signup is temporarily unavailable." }, { status: 503, headers });
    }
    throw error;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Signup is temporarily unavailable." }, { status: 503, headers });
  }

  const admin = createSupabaseAdmin();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existingProfile) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409, headers });
  }

  const loginEmail = internalEmailForUsername(username, supabaseUrl);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (createError || !created.user) {
    console.error("Server-side signup failed", {
      code: createError?.code,
      status: createError?.status
    });
    return NextResponse.json(
      { error: "That account could not be created. Try another username." },
      { status: 400, headers }
    );
  }

  const authClient = createServerAuthClient();
  const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({
    email: loginEmail,
    password
  });
  if (signInError || !signedIn.session) {
    console.error("New account automatic sign-in failed", {
      userId: created.user.id,
      code: signInError?.code,
      status: signInError?.status
    });
    return NextResponse.json(
      {
        success: true,
        session: null,
        emailVerificationSent: false,
        warning: "Your account was created. Log in with the same username and password to continue."
      },
      { status: 201, headers }
    );
  }

  const redirectTo = authEmailRedirect({
    platform,
    flow: "verify-email",
    appUrl: configuredAppUrl()
  });
  const { error: verificationError } = await authClient.auth.updateUser(
    { email },
    { emailRedirectTo: redirectTo }
  );
  if (verificationError) {
    console.error("Recovery email verification could not be started", {
      userId: created.user.id,
      code: verificationError.code,
      status: verificationError.status
    });
  }

  return NextResponse.json({
    success: true,
    session: publicSession(signedIn.session),
    emailVerificationSent: !verificationError,
    warning: verificationError
      ? "Your account is ready, but the verification email could not be sent. You can retry from Settings."
      : null
  }, { status: 201, headers });
}
