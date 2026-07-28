import { describe, expect, it } from "vitest";
import { normalizeCspReports } from "./cspReports";

describe("normalizeCspReports", () => {
  it("removes query strings and identifiers from legacy reports", () => {
    expect(
      normalizeCspReports(
        {
          "csp-report": {
            "document-uri":
              "https://league.example/games/40000000-0000-4000-8000-000000000001?token=secret",
            "effective-directive": "script-src-elem",
            "blocked-uri":
              "https://unexpected.example/tracker.js?user=123",
            "source-file":
              "https://league.example/_next/static/app.js?v=private",
            "line-number": 12
          }
        },
        "https://league.example"
      )
    ).toEqual([
      {
        effectiveDirective: "script-src-elem",
        disposition: undefined,
        document: "/games/redacted-id",
        blocked: "https://unexpected.example",
        source: "/_next/static/app.js",
        line: 12,
        column: undefined
      }
    ]);
  });

  it("accepts Reporting API batches and rejects malformed entries", () => {
    expect(
      normalizeCspReports(
        [
          {
            type: "csp-violation",
            body: {
              documentURL: "https://league.example/admin?tab=games",
              effectiveDirective: "connect-src",
              blockedURL: "data:text/plain,private",
              disposition: "report"
            }
          },
          {
            type: "csp-violation",
            body: { blockedURL: "https://bad.example" }
          }
        ],
        "https://league.example"
      )
    ).toEqual([
      {
        effectiveDirective: "connect-src",
        disposition: "report",
        document: "/admin",
        blocked: "data:",
        source: undefined,
        line: undefined,
        column: undefined
      }
    ]);
  });
});
