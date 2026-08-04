import { describe, expect, it } from "vitest";
import { fixtureDateKey, fixtureTabDate, isGameAwaitingUpdate, MATCH_WINDOW_MS, organizeGames } from "./gameSchedule";
import type { Game, GameStatus } from "./types";

function game(id: string, date: Date, status: GameStatus): Game {
  return { id, game_date: date.toISOString(), status, potm_player_id: null };
}

describe("game schedule", () => {
  const now = new Date(2026, 7, 4, 12).getTime();

  it("keeps a match visible through its six-hour match window", () => {
    const recentKickoff = game("recent", new Date(now - MATCH_WINDOW_MS + 1), "draft");
    expect(isGameAwaitingUpdate(recentKickoff, now)).toBe(false);
  });

  it("moves non-final old games to awaiting update without calling them DNP", () => {
    const old = game("old", new Date(2026, 6, 24, 20), "draft");
    const future = game("future", new Date(2026, 7, 6, 20), "upcoming");
    const final = game("final", new Date(2026, 6, 17, 20), "final");
    const schedule = organizeGames([old, final, future], now);

    expect(schedule.active.map(item => item.id)).toEqual(["future"]);
    expect(schedule.awaitingUpdate.map(item => item.id)).toEqual(["old"]);
    expect(schedule.results.map(item => item.id)).toEqual(["final"]);
  });

  it("keeps live games first even after their scheduled time", () => {
    const live = game("live", new Date(2026, 6, 1, 20), "live");
    const future = game("future", new Date(2026, 7, 6, 20), "draft");
    expect(organizeGames([future, live], now).active.map(item => item.id)).toEqual(["live", "future"]);
  });

  it("formats fixture tabs with a year only outside the current year", () => {
    expect(fixtureTabDate(new Date(2026, 7, 6, 20).toISOString(), 2026)).toBe("06/08");
    expect(fixtureTabDate(new Date(2027, 0, 7, 20).toISOString(), 2026)).toBe("07/01/2027");
  });

  it("uses local calendar dates for calendar grouping", () => {
    expect(fixtureDateKey(new Date(2026, 7, 6, 20))).toBe("2026-08-06");
  });
});
