import { describe, expect, it } from "vitest";
import {
  fantasyDeadlineTarget,
  gameNotificationPayload
} from "./leagueNotifications";

describe("league notification destinations", () => {
  const slug = "sunday-five-a-side";
  const league = { slug, name: "Sunday Five-a-Side" };

  it("opens a scheduled game inside the originating league", () => {
    expect(gameNotificationPayload(
      "game_scheduled",
      { id: "game-1", status: "upcoming" },
      league
    )?.url).toBe(`/l/${slug}/games/game-1`);
  });

  it("opens the originating league fantasy picker for confirmed lineups", () => {
    expect(gameNotificationPayload(
      "lineups_ready",
      { id: "game-1", status: "draft" },
      league
    )?.url).toBe(`/l/${slug}/fantasy?tab=set`);
  });

  it("opens the finalized game inside the originating league", () => {
    expect(gameNotificationPayload(
      "result_finalized",
      { id: "game-1", status: "final" },
      league,
      { A: 4, B: 3 }
    )?.url).toBe(`/l/${slug}/games/game-1`);
  });

  it("opens deadline reminders in the originating league", () => {
    expect(fantasyDeadlineTarget(slug)).toBe(`/l/${slug}/fantasy?tab=set`);
  });

  it("does not create notifications for invalid game states", () => {
    expect(gameNotificationPayload(
      "lineups_ready",
      { id: "game-1", status: "upcoming" },
      league
    )).toBeNull();
  });
});
