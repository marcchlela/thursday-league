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

  it("does not expose unknown database details", () => {
    expect(
      friendlyActionError(
        'column "internal_secret" of relation "profiles" does not exist',
        "Profile could not be updated."
      )
    ).toBe("Profile could not be updated.");
  });

  it("explains common database validation failures", () => {
    expect(friendlyActionError("value violates check constraint profile_name_check")).toContain(
      "submitted information"
    );
  });
});
