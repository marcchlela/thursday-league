function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "";
}

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
    normalized.includes("network request failed")
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
  if (
    normalized.includes("row-level security") ||
    normalized.includes("permission denied") ||
    normalized.includes("not authorized")
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

  return message;
}
