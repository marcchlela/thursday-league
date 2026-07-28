function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "";
}

const safeDomainMessages = [
  "a correction reason is required",
  "accepted bets make",
  "adjustment ",
  "assign another active administrator",
  "betting closed",
  "betting closes",
  "betting is ",
  "cash-out closes",
  "choose ",
  "combined odds exceed",
  "custom season",
  "fantasy is locked",
  "final games ",
  "fixed teams need",
  "game is already final",
  "generate markets first",
  "guest players cannot",
  "lineups can only",
  "markets cannot",
  "markets with accepted bets",
  "missing markets can only",
  "name needs at least",
  "no entirely missing",
  "no markets ",
  "not enough coins",
  "odds can only",
  "odds must",
  "one or more selections",
  "only a final game",
  "only draft odds",
  "only pending bets",
  "pick exactly five",
  "player name is required",
  "potential return exceeds",
  "reason must be",
  "reopen the final game",
  "save ",
  "selections must",
  "stake must",
  "statistics must",
  "suspend the complete market",
  "the game setup changed",
  "the lineup ",
  "the saved lineup",
  "the selected player",
  "there are no existing markets",
  "these markets were invalidated",
  "this game has no season",
  "this player is not eligible",
  "too many bets",
  "type delete",
  "wallet could not"
];

export function friendlyActionError(
  error: unknown,
  fallback = "That action could not be completed. Please try again."
) {
  const message = errorMessage(error).trim();
  const normalized = message.toLowerCase();

  if (!message) return fallback;
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed") ||
    normalized.includes("load failed")
  ) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (
    normalized.includes("jwt") ||
    (normalized.includes("session") && normalized.includes("expired")) ||
    normalized.includes("refresh token")
  ) {
    return "Your session has expired. Sign in again, then retry the action.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "The username or password is incorrect.";
  }
  if (normalized.includes("user already registered") || normalized.includes("already been registered")) {
    return "That username is already in use. Choose another one.";
  }
  if (normalized.includes("password should be different")) {
    return "Choose a password different from your current password.";
  }
  if (
    normalized.includes("row-level security") ||
    normalized.includes("permission denied") ||
    normalized.includes("not authorized") ||
    normalized.includes("admin access required")
  ) {
    return "You do not have permission to perform this action.";
  }
  if (
    normalized.includes("duplicate key") ||
    normalized.includes("unique constraint")
  ) {
    return "This has already been saved. Refresh the page before trying again.";
  }
  if (
    normalized.includes("final games are locked") ||
    normalized.includes("controlled correction")
  ) {
    return "This result is finalized. Reopen it with a correction reason before editing.";
  }
  if (normalized.includes("violates foreign key constraint")) {
    return "This item is still used by league history and cannot be removed.";
  }
  if (
    normalized.includes("invalid input syntax") ||
    normalized.includes("violates check constraint") ||
    normalized.includes("null value in column")
  ) {
    return "Some submitted information is invalid. Review the fields and try again.";
  }
  if (normalized.includes("statement timeout") || normalized.includes("canceling statement")) {
    return "The server took too long to respond. Please try again.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "Too many attempts were made. Wait a moment and try again.";
  }
  if (normalized.includes("not authenticated")) {
    return "Your session has expired. Sign in again, then retry the action.";
  }
  if (safeDomainMessages.some(prefix => normalized.startsWith(prefix))) {
    return message;
  }

  return fallback;
}
