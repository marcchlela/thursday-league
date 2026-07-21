export const CUSTOM_NOTIFICATION_TITLE_MAX = 60;
export const CUSTOM_NOTIFICATION_BODY_MAX = 180;

export type CustomNotificationDestination = "home" | "upcoming_game" | "fantasy" | "bets";

export type CustomNotificationRequest = {
  title: string;
  body: string;
  destination: CustomNotificationDestination;
  gameId: string | null;
  requestId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DESTINATIONS = new Set<CustomNotificationDestination>(["home", "upcoming_game", "fantasy", "bets"]);

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateCustomNotification(value: unknown): { data: CustomNotificationRequest; error: null } | { data: null; error: string } {
  if (!value || typeof value !== "object") return { data: null, error: "Invalid request body." };
  const input = value as Record<string, unknown>;
  const title = cleanText(input.title);
  const body = cleanText(input.body);
  const destination = typeof input.destination === "string" && DESTINATIONS.has(input.destination as CustomNotificationDestination)
    ? input.destination as CustomNotificationDestination
    : null;
  const gameId = typeof input.gameId === "string" ? input.gameId : null;
  const requestId = typeof input.requestId === "string" ? input.requestId : "";

  if (title.length < 2) return { data: null, error: "Enter a notification title." };
  if (title.length > CUSTOM_NOTIFICATION_TITLE_MAX) return { data: null, error: `Keep the title within ${CUSTOM_NOTIFICATION_TITLE_MAX} characters.` };
  if (body.length < 2) return { data: null, error: "Enter a notification message." };
  if (body.length > CUSTOM_NOTIFICATION_BODY_MAX) return { data: null, error: `Keep the message within ${CUSTOM_NOTIFICATION_BODY_MAX} characters.` };
  if (!destination) return { data: null, error: "Choose where the notification should open." };
  if (destination === "upcoming_game" && (!gameId || !UUID_PATTERN.test(gameId))) return { data: null, error: "Choose a valid upcoming game." };
  if (!UUID_PATTERN.test(requestId)) return { data: null, error: "The notification request identifier is invalid." };

  return { data: { title, body, destination, gameId: destination === "upcoming_game" ? gameId : null, requestId }, error: null };
}

export function customNotificationTarget(destination: CustomNotificationDestination, gameId?: string | null) {
  if (destination === "upcoming_game" && gameId) return `/games/${gameId}`;
  if (destination === "fantasy") return "/fantasy?tab=set";
  if (destination === "bets") return "/betting?tab=markets";
  return "/";
}

export function customNotificationDestinationLabel(destination: CustomNotificationDestination) {
  if (destination === "upcoming_game") return "Upcoming game";
  if (destination === "fantasy") return "Fantasy";
  if (destination === "bets") return "Bets";
  return "Home";
}
