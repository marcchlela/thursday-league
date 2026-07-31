import { describe, expect, it, vi } from "vitest";
import { describeLoadProblem, withLoadTimeout } from "./loadProblems";

describe("load problem messages", () => {
  it.each([
    ["missing database relation", { message: 'relation "public.leagues" does not exist' }, "database"],
    ["expired login", { message: "JWT session expired" }, "authentication"],
    ["permission change", { message: "row-level security policy denied access" }, "permission"],
    ["server outage", { message: "503 Service Unavailable" }, "server"],
    ["unstable connection", { message: "Failed to fetch" }, "network"],
    ["request timeout", { message: "statement timeout" }, "timeout"],
    ["deployment configuration", { message: "Supabase is not configured" }, "configuration"]
  ])("classifies %s", (_label, error, kind) => {
    expect(describeLoadProblem(error).kind).toBe(kind);
  });

  it("uses a safe fallback for an unknown failure", () => {
    expect(describeLoadProblem(new Error("unexpected"), "Try this page again.")).toEqual({
      kind: "unknown",
      title: "This could not be loaded",
      message: "Try this page again."
    });
  });

  it.each([
    [{ message: 'relation "public.leagues" does not exist' }, "Service temporarily unavailable"],
    [{ message: "Supabase is not configured" }, "Service temporarily unavailable"]
  ])("does not expose technical setup details", (error, expectedTitle) => {
    const problem = describeLoadProblem(error);
    expect(problem.title).toBe(expectedTitle);
    expect(problem.message.toLowerCase()).not.toMatch(/database|migration|supabase|environment|configuration/);
  });

  it("turns a stalled request into a timeout", async () => {
    vi.useFakeTimers();
    const stalled = withLoadTimeout(new Promise<string>(() => undefined), 25);
    const expectation = expect(stalled).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    vi.useRealTimers();
  });
});
