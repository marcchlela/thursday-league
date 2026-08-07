import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const bundleIdentifier = "app.thursdayleague.mobile";
const teamIdPattern = /^[A-Z0-9]{10}$/;

export async function GET() {
  const teamId = (process.env.APPLE_TEAM_ID || "").trim().toUpperCase();
  if (!teamIdPattern.test(teamId)) {
    return NextResponse.json(
      { error: "Native link association is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json({
    applinks: {
      apps: [],
      details: [{
        appID: `${teamId}.${bundleIdentifier}`,
        components: [
          { "/": "/invite/*", comment: "League invitation links" },
          { "/": "/auth/confirm*", comment: "Account confirmation and recovery links" },
          { "/": "/l/*", comment: "League pages" }
        ]
      }]
    }
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "application/json"
    }
  });
}
