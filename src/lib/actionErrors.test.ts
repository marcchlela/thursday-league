import { describe, expect, it } from "vitest";
import { friendlyActionError } from "./actionErrors";

describe("friendlyActionError", () => {
  it("turns network and session failures into actionable messages", () => {
    expect(friendlyActionError(new Error("Failed to fetch"))).toContain("connection");
    expect(friendlyActionError({ message: "JWT expired" })).toContain("Sign in again");
  });

  it("explains protected finalized results", () => {
    expect(
      friendlyActionError("Use the controlled correction function")
    ).toContain("correction reason");
  });

  it("preserves already-friendly domain errors", () => {
    expect(friendlyActionError("Betting closes five minutes before kickoff.")).toBe(
      "Betting closes five minutes before kickoff."
    );
  });
});
