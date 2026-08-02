import {
  AutomaticNotificationType,
  defaultNotificationTemplate,
  NotificationTemplate,
  notificationDestinationUrl,
  renderNotificationText
} from "./notificationTemplates";

export type LeagueGameNotificationEvent =
  | "game_scheduled"
  | "lineups_ready"
  | "result_finalized";

export type LeagueNotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  ttl: number;
};

export function gameNotificationPayload(
  event: LeagueGameNotificationEvent,
  game: { id: string; status: string },
  league: { slug: string; name: string },
  score?: { A: number; B: number },
  storedTemplate?: NotificationTemplate
): LeagueNotificationPayload | null {
  const notificationType: AutomaticNotificationType = event === "game_scheduled"
    ? "new_game"
    : event === "lineups_ready"
      ? "lineups_ready"
      : "final_results";
  const template = storedTemplate || defaultNotificationTemplate(notificationType);
  if (!template.enabled) return null;

  if (event === "game_scheduled" && game.status === "upcoming") {
    const text = renderNotificationText(template, { league_name: league.name });
    return {
      ...text,
      url: notificationDestinationUrl(template.destination, { leagueSlug: league.slug, gameId: game.id }),
      tag: `game-scheduled-${game.id}`,
      ttl: 86400
    };
  }

  if (
    event === "lineups_ready"
    && (game.status === "draft" || game.status === "live")
  ) {
    const text = renderNotificationText(template, { league_name: league.name });
    return {
      ...text,
      url: notificationDestinationUrl(template.destination, { leagueSlug: league.slug, gameId: game.id }),
      tag: `lineups-ready-${game.id}`,
      ttl: 21600
    };
  }

  if (event === "result_finalized" && game.status === "final" && score) {
    const text = renderNotificationText(template, {
      league_name: league.name,
      team_a_score: score.A,
      team_b_score: score.B
    });
    return {
      ...text,
      url: notificationDestinationUrl(template.destination, { leagueSlug: league.slug, gameId: game.id }),
      tag: `result-finalized-${game.id}`,
      ttl: 86400
    };
  }

  return null;
}

export function fantasyDeadlineTarget(leagueSlug: string) {
  return `/l/${leagueSlug}/fantasy?tab=set`;
}
