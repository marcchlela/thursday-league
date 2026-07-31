import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const packageName = "app.thursdayleague.mobile";
const fingerprintPattern = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export async function GET() {
  const fingerprints = (process.env.ANDROID_APP_CERT_SHA256 || "")
    .split(",")
    .map(value => value.trim().toUpperCase())
    .filter(value => fingerprintPattern.test(value));

  if (!fingerprints.length) {
    return NextResponse.json(
      { error: "Native link association is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints
    }
  }], {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "application/json"
    }
  });
}
