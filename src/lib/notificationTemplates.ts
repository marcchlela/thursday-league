export const NOTIFICATION_TEMPLATE_TITLE_MAX = 60;
export const NOTIFICATION_TEMPLATE_BODY_MAX = 180;

export const AUTOMATIC_NOTIFICATION_TYPES = [
  "new_game",
  "lineups_ready",
  "final_results",
  "fantasy_deadline",
  "join_request",
  "join_approved",
  "betting_unlocked",
  "matchday_reminder"
] as const;

export type AutomaticNotificationType = typeof AUTOMATIC_NOTIFICATION_TYPES[number];

export const NOTIFICATION_DESTINATIONS = [
  "league_home",
  "games",
  "game",
  "fantasy",
  "betting",
  "league_members"
] as const;

export type NotificationDestination = typeof NOTIFICATION_DESTINATIONS[number];

export type NotificationTemplate = {
  notificationType: AutomaticNotificationType;
  enabled: boolean;
  titleTemplate: string;
  bodyTemplate: string;
  destination: NotificationDestination;
  updatedAt?: string | null;
};

type TemplateDefinition = {
  label: string;
  description: string;
  defaultTitle: string;
  defaultBody: string;
  defaultDestination: NotificationDestination;
  allowedDestinations: NotificationDestination[];
  variables: Array<{ key: string; label: string; example: string }>;
};

export const NOTIFICATION_DESTINATION_LABELS: Record<NotificationDestination, string> = {
  league_home: "League home",
  games: "Games",
  game: "Relevant game",
  fantasy: "Fantasy team",
  betting: "Betting markets",
  league_members: "League members"
};

export const NOTIFICATION_TEMPLATE_DEFINITIONS: Record<AutomaticNotificationType, TemplateDefinition> = {
  new_game: {
    label: "New game scheduled",
    description: "Sent to league members when an owner or admin schedules a new game.",
    defaultTitle: "New game",
    defaultBody: "A new game was scheduled in {league_name}. Tap to see kickoff in your local time.",
    defaultDestination: "game",
    allowedDestinations: ["game", "games", "league_home"],
    variables: [{ key: "league_name", label: "League name", example: "Thursday League" }]
  },
  lineups_ready: {
    label: "Lineups confirmed",
    description: "Sent when valid lineups are confirmed and Fantasy becomes available.",
    defaultTitle: "Lineups ready",
    defaultBody: "The lineups are confirmed in {league_name}. Fantasy is open—tap to make your picks.",
    defaultDestination: "fantasy",
    allowedDestinations: ["fantasy", "game", "games", "league_home"],
    variables: [{ key: "league_name", label: "League name", example: "Thursday League" }]
  },
  final_results: {
    label: "Final result",
    description: "Sent after a game result and its statistics are finalized.",
    defaultTitle: "Final result",
    defaultBody: "Team A {team_a_score}-{team_b_score} Team B in {league_name}. Tap to see the match and Fantasy results.",
    defaultDestination: "game",
    allowedDestinations: ["game", "games", "fantasy", "league_home"],
    variables: [
      { key: "league_name", label: "League name", example: "Thursday League" },
      { key: "team_a_score", label: "Team A score", example: "4" },
      { key: "team_b_score", label: "Team B score", example: "3" }
    ]
  },
  fantasy_deadline: {
    label: "Fantasy deadline",
    description: "Sent before kickoff only to members who have not saved a Fantasy team.",
    defaultTitle: "Fantasy deadline",
    defaultBody: "Your {league_name} team is not saved yet. Tap to make your picks before kickoff.",
    defaultDestination: "fantasy",
    allowedDestinations: ["fantasy", "game", "games", "league_home"],
    variables: [{ key: "league_name", label: "League name", example: "Thursday League" }]
  },
  join_request: {
    label: "New join request",
    description: "Sent to the league owner and admins when someone requests access using a code.",
    defaultTitle: "New join request",
    defaultBody: "{username} requested to join {league_name}.",
    defaultDestination: "league_members",
    allowedDestinations: ["league_members", "league_home"],
    variables: [
      { key: "username", label: "Requesting username", example: "marcos" },
      { key: "league_name", label: "League name", example: "Thursday League" }
    ]
  },
  join_approved: {
    label: "Join request approved",
    description: "Sent to a member after an owner or admin accepts their request.",
    defaultTitle: "You joined {league_name}",
    defaultBody: "{admin_name} accepted your request. Tap to open the league.",
    defaultDestination: "league_home",
    allowedDestinations: ["league_home", "games"],
    variables: [
      { key: "admin_name", label: "Approving admin", example: "marc" },
      { key: "league_name", label: "League name", example: "Thursday League" }
    ]
  },
  betting_unlocked: {
    label: "Betting unlocked",
    description: "Sent once when a league completes the three-game betting warm-up.",
    defaultTitle: "Betting unlocked",
    defaultBody: "{required_games} games are complete. Virtual betting is now open in {league_name}.",
    defaultDestination: "betting",
    allowedDestinations: ["betting", "league_home", "games"],
    variables: [
      { key: "required_games", label: "Required games", example: "3" },
      { key: "league_name", label: "League name", example: "Thursday League" }
    ]
  },
  matchday_reminder: {
    label: "Matchday morning",
    description: "Sent once on the morning of a scheduled matchday.",
    defaultTitle: "It's matchday!",
    defaultBody: "There is a {league_name} game today. Tap to see kickoff in your local time.",
    defaultDestination: "game",
    allowedDestinations: ["game", "games", "league_home"],
    variables: [{ key: "league_name", label: "League name", example: "Thursday League" }]
  }
};

const TYPE_SET = new Set<string>(AUTOMATIC_NOTIFICATION_TYPES);
const DESTINATION_SET = new Set<string>(NOTIFICATION_DESTINATIONS);
const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/g;

export function isAutomaticNotificationType(value: unknown): value is AutomaticNotificationType {
  return typeof value === "string" && TYPE_SET.has(value);
}

function cleanTemplateText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function placeholders(value: string) {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map(match => match[1]);
}

export function defaultNotificationTemplate(notificationType: AutomaticNotificationType): NotificationTemplate {
  const definition = NOTIFICATION_TEMPLATE_DEFINITIONS[notificationType];
  return {
    notificationType,
    enabled: true,
    titleTemplate: definition.defaultTitle,
    bodyTemplate: definition.defaultBody,
    destination: definition.defaultDestination,
    updatedAt: null
  };
}

export function validateNotificationTemplate(value: unknown):
  | { data: NotificationTemplate; error: null }
  | { data: null; error: string } {
  if (!value || typeof value !== "object") return { data: null, error: "Invalid notification template." };
  const input = value as Record<string, unknown>;
  if (!isAutomaticNotificationType(input.notificationType)) return { data: null, error: "Choose a valid notification type." };

  const notificationType = input.notificationType;
  const definition = NOTIFICATION_TEMPLATE_DEFINITIONS[notificationType];
  const titleTemplate = cleanTemplateText(input.titleTemplate);
  const bodyTemplate = cleanTemplateText(input.bodyTemplate);
  const destination = typeof input.destination === "string" && DESTINATION_SET.has(input.destination)
    ? input.destination as NotificationDestination
    : null;

  if (typeof input.enabled !== "boolean") return { data: null, error: "Choose whether this notification is enabled." };
  if (titleTemplate.length < 2) return { data: null, error: "Enter a notification title." };
  if (titleTemplate.length > NOTIFICATION_TEMPLATE_TITLE_MAX) return { data: null, error: `Keep the title within ${NOTIFICATION_TEMPLATE_TITLE_MAX} characters.` };
  if (bodyTemplate.length < 2) return { data: null, error: "Enter a notification message." };
  if (bodyTemplate.length > NOTIFICATION_TEMPLATE_BODY_MAX) return { data: null, error: `Keep the message within ${NOTIFICATION_TEMPLATE_BODY_MAX} characters.` };
  if (!destination || !definition.allowedDestinations.includes(destination)) return { data: null, error: "Choose a supported destination for this notification." };

  const allowedVariables = new Set(definition.variables.map(variable => variable.key));
  const usedVariables = [...placeholders(titleTemplate), ...placeholders(bodyTemplate)];
  const unsupported = usedVariables.find(variable => !allowedVariables.has(variable));
  if (unsupported) return { data: null, error: `{${unsupported}} is not available for this notification.` };

  const braceFree = `${titleTemplate} ${bodyTemplate}`.replace(PLACEHOLDER_PATTERN, "");
  if (braceFree.includes("{") || braceFree.includes("}")) return { data: null, error: "A notification placeholder is incomplete." };

  return {
    data: { notificationType, enabled: input.enabled, titleTemplate, bodyTemplate, destination },
    error: null
  };
}

function truncate(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(maximum - 1, 0)).trimEnd()}…`;
}

export function renderNotificationText(
  template: Pick<NotificationTemplate, "titleTemplate" | "bodyTemplate">,
  values: Record<string, string | number>
) {
  const replace = (value: string) => value.replace(PLACEHOLDER_PATTERN, (_, key: string) => String(values[key] ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: truncate(replace(template.titleTemplate), NOTIFICATION_TEMPLATE_TITLE_MAX),
    body: truncate(replace(template.bodyTemplate), NOTIFICATION_TEMPLATE_BODY_MAX)
  };
}

export function notificationDestinationUrl(
  destination: NotificationDestination,
  context: { leagueSlug: string; gameId?: string | null }
) {
  const root = `/l/${context.leagueSlug}`;
  if (destination === "games") return `${root}/games`;
  if (destination === "game") return context.gameId ? `${root}/games/${context.gameId}` : `${root}/games`;
  if (destination === "fantasy") return `${root}/fantasy?tab=set`;
  if (destination === "betting") return `${root}/betting?tab=markets`;
  if (destination === "league_members") return `${root}/admin?section=league`;
  return root;
}

export function notificationTemplatePreviewValues(notificationType: AutomaticNotificationType) {
  return Object.fromEntries(
    NOTIFICATION_TEMPLATE_DEFINITIONS[notificationType].variables.map(variable => [variable.key, variable.example])
  );
}
