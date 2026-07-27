import { describe, expect, it } from "vitest";
import { redactObservabilityUrl } from "./observability";

describe("redactObservabilityUrl", () => {
  it("removes identifiers, query parameters, and fragments", () => {
    expect(
      redactObservabilityUrl(
        "https://league.example/fantasy/history/40000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001?tab=squad#player"
      )
    ).toBe("https://league.example/fantasy/history/redacted-id/redacted-id");
  });

  it("does not collect private admin or API routes", () => {
    expect(redactObservabilityUrl("https://league.example/admin?tab=games")).toBeNull();
    expect(redactObservabilityUrl("https://league.example/api/push/test")).toBeNull();
  });

  it("keeps ordinary user-facing paths", () => {
    expect(redactObservabilityUrl("https://league.example/games?tab=results")).toBe(
      "https://league.example/games"
    );
  });
});
