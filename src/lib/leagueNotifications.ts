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
  leagueSlug: string,
  score?: { A: number; B: number }
): LeagueNotificationPayload | null {
  const leagueRoot = `/l/${leagueSlug}`;

  if (event === "game_scheduled" && game.status === "upcoming") {
    return {
      title: "New game",
      body: "A new game was scheduled. Tap to see kickoff in your local time.",
      url: `${leagueRoot}/games/${game.id}`,
      tag: `game-scheduled-${game.id}`,
      ttl: 86400
    };
  }

  if (
    event === "lineups_ready"
    && (game.status === "draft" || game.status === "live")
  ) {
    return {
      title: "Lineups ready",
      body: "The lineups are confirmed. Tap to view them and create your fantasy team.",
      url: `${leagueRoot}/fantasy?tab=set`,
      tag: `lineups-ready-${game.id}`,
      ttl: 21600
    };
  }

  if (event === "result_finalized" && game.status === "final" && score) {
    return {
      title: "Final result",
      body: `Team A ${score.A}-${score.B} Team B. Tap to see game and fantasy details.`,
      url: `${leagueRoot}/games/${game.id}`,
      tag: `result-finalized-${game.id}`,
      ttl: 86400
    };
  }

  return null;
}

export function fantasyDeadlineTarget(leagueSlug: string) {
  return `/l/${leagueSlug}/fantasy?tab=set`;
}
