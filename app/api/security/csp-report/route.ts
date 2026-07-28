import { normalizeCspReports } from "@/lib/cspReports";
import {
  requestClientIdentifier,
  serverRateLimitDecision
} from "@/lib/serverRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumReportBytes = 32 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maximumReportBytes) {
    return new Response(null, { status: 413 });
  }

  const limit = await serverRateLimitDecision({
    scope: "csp-report",
    identifier: requestClientIdentifier(request),
    maximumAttempts: 30,
    windowSeconds: 60
  });
  if (!limit.allowed) return new Response(null, { status: 204 });

  const text = await request.text().catch(() => "");
  if (!text || text.length > maximumReportBytes) {
    return new Response(null, { status: text ? 413 : 204 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return new Response(null, { status: 204 });
  }
  const reports = normalizeCspReports(payload, new URL(request.url).origin);
  for (const report of reports) {
    console.warn("CSP violation", report);
  }

  return new Response(null, { status: 204 });
}
