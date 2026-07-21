import { describe, expect, it } from "vitest";
import { customNotificationTarget, validateCustomNotification } from "./customNotifications";

const validInput = {
  title: "Thursday update",
  body: "Lineups will be posted soon.",
  destination: "home",
  gameId: null,
  requestId: "00000000-0000-4000-8000-000000000001"
};

describe("custom notification validation", () => {
  it("normalizes safe admin-authored content", () => {
    const result = validateCustomNotification({ ...validInput, title: "  Thursday   update ", body: " Lineups\nwill be posted soon. " });
    expect(result).toEqual({ data: { ...validInput, title: "Thursday update", body: "Lineups will be posted soon." }, error: null });
  });

  it("requires a valid game for the upcoming-game destination", () => {
    const result = validateCustomNotification({ ...validInput, destination: "upcoming_game", gameId: "not-a-game" });
    expect(result.data).toBeNull();
    expect(result.error).toContain("valid upcoming game");
  });

  it("maps only the supported in-app destinations", () => {
    expect(customNotificationTarget("home")).toBe("/");
    expect(customNotificationTarget("fantasy")).toBe("/fantasy?tab=set");
    expect(customNotificationTarget("bets")).toBe("/betting?tab=markets");
    expect(customNotificationTarget("upcoming_game", "00000000-0000-4000-8000-000000000001")).toBe("/games/00000000-0000-4000-8000-000000000001");
  });
});
