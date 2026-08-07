import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_NOTIFICATION_TYPES,
  defaultNotificationTemplate,
  notificationDestinationUrl,
  renderNotificationText,
  validateNotificationTemplate
} from "./notificationTemplates";

describe("automatic notification templates", () => {
  it("keeps every shipped default valid", () => {
    for (const notificationType of AUTOMATIC_NOTIFICATION_TYPES) {
      const result = validateNotificationTemplate(defaultNotificationTemplate(notificationType));
      expect(result.error).toBeNull();
      expect(result.data?.notificationType).toBe(notificationType);
    }
  });

  it("replaces only the supported runtime details", () => {
    const result = renderNotificationText(defaultNotificationTemplate("final_results"), {
      league_name: "Thursday League",
      team_a_score: 4,
      team_b_score: 3
    });
    expect(result.title).toBe("Final result");
    expect(result.body).toBe("Team A 4-3 Team B in Thursday League. Tap to see the match and Fantasy results.");
  });

  it("rejects a placeholder that the event cannot provide", () => {
    const result = validateNotificationTemplate({
      ...defaultNotificationTemplate("new_game"),
      bodyTemplate: "Open {admin_name}'s new match."
    });
    expect(result.data).toBeNull();
    expect(result.error).toContain("{admin_name}");
  });

  it("rejects malformed placeholders", () => {
    const result = validateNotificationTemplate({
      ...defaultNotificationTemplate("join_request"),
      bodyTemplate: "{username requested to join {league_name}."
    });
    expect(result.data).toBeNull();
    expect(result.error).toContain("incomplete");
  });

  it("rejects destinations that are unsafe for the selected event", () => {
    const result = validateNotificationTemplate({
      ...defaultNotificationTemplate("join_approved"),
      destination: "league_members"
    });
    expect(result.data).toBeNull();
    expect(result.error).toContain("supported destination");
  });

  it("builds only league-scoped application destinations", () => {
    const context = { leagueSlug: "sunday-five-a-side", gameId: "game-1" };
    expect(notificationDestinationUrl("league_home", context)).toBe("/l/sunday-five-a-side");
    expect(notificationDestinationUrl("game", context)).toBe("/l/sunday-five-a-side/games/game-1");
    expect(notificationDestinationUrl("fantasy", context)).toBe("/l/sunday-five-a-side/fantasy?tab=set");
    expect(notificationDestinationUrl("betting", context)).toBe("/l/sunday-five-a-side/betting?tab=markets");
    expect(notificationDestinationUrl("league_members", context)).toBe("/l/sunday-five-a-side/admin?section=league");
  });
});
