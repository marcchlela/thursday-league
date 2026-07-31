import { describe, expect, it } from "vitest";
import { isMatchdayMorning } from "./scheduledNotifications";

describe("scheduled notifications", () => {
  it("opens the morning window in the league owner's timezone", () => {
    const kickoff = new Date("2026-07-30T19:00:00.000Z");
    expect(isMatchdayMorning(
      new Date("2026-07-30T06:05:00.000Z"),
      kickoff,
      "Asia/Beirut"
    )).toBe(true);
  });

  it("does not send before the morning window or after kickoff", () => {
    const kickoff = new Date("2026-07-30T19:00:00.000Z");
    expect(isMatchdayMorning(
      new Date("2026-07-30T04:30:00.000Z"),
      kickoff,
      "Asia/Beirut"
    )).toBe(false);
    expect(isMatchdayMorning(
      new Date("2026-07-30T20:00:00.000Z"),
      kickoff,
      "Asia/Beirut"
    )).toBe(false);
  });

  it("does not confuse neighboring calendar days across timezones", () => {
    expect(isMatchdayMorning(
      new Date("2026-07-30T22:30:00.000Z"),
      new Date("2026-07-31T18:00:00.000Z"),
      "Europe/London"
    )).toBe(false);
  });
});

