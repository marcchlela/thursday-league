import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdmin } from "./supabaseAdmin";

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("The request limiter is unavailable.");
    this.name = "RateLimitUnavailableError";
  }
}

export function requestClientIdentifier(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = request.headers.get("x-real-ip")?.trim();
  return forwarded || direct || "unknown-client";
}

export async function consumeServerRateLimit({
  scope,
  identifier,
  maximumAttempts,
  windowSeconds
}: {
  scope: string;
  identifier: string;
  maximumAttempts: number;
  windowSeconds: number;
}) {
  const bucketKey = createHash("sha256")
    .update(`${scope}:${identifier}`)
    .digest("hex");
  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("consume_api_rate_limit", {
    target_bucket_key: bucketKey,
    maximum_attempts: maximumAttempts,
    window_seconds: windowSeconds
  });

  if (error) {
    console.error("Server rate limiter failed", {
      scope,
      message: error.message
    });
    throw new RateLimitUnavailableError();
  }

  return data === true;
}

export async function serverRateLimitDecision(options: {
  scope: string;
  identifier: string;
  maximumAttempts: number;
  windowSeconds: number;
}) {
  try {
    const allowed = await consumeServerRateLimit(options);
    return allowed
      ? { allowed: true as const }
      : {
          allowed: false as const,
          status: 429,
          error: "Too many requests. Wait a moment and try again."
        };
  } catch (error) {
    if (!(error instanceof RateLimitUnavailableError)) throw error;
    return {
      allowed: false as const,
      status: 503,
      error: "This action is temporarily unavailable."
    };
  }
}
