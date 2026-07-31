export type LoadProblemKind =
  | "offline"
  | "network"
  | "timeout"
  | "server"
  | "database"
  | "permission"
  | "authentication"
  | "configuration"
  | "unknown";

export type LoadProblem = {
  kind: LoadProblemKind;
  title: string;
  message: string;
};

function errorDetails(error: unknown) {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const values = ["message", "details", "hint", "code", "status"]
    .map(key => key in error ? String((error as Record<string, unknown>)[key] || "") : "")
    .filter(Boolean);
  return values.join(" ");
}

export function describeLoadProblem(
  error: unknown,
  fallback = "The requested information could not be loaded. Try again."
): LoadProblem {
  const details = errorDetails(error).toLowerCase();
  const offline = typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && !navigator.onLine;

  if (offline) {
    return {
      kind: "offline",
      title: "You are offline",
      message: "Reconnect to Wi-Fi or mobile data, then try again."
    };
  }

  if (
    details.includes("supabase is not configured")
    || details.includes("project url")
    || details.includes("anon key")
    || details.includes("configuration is incomplete")
  ) {
    return {
      kind: "configuration",
      title: "Service temporarily unavailable",
      message: "The app cannot load this right now. Please try again shortly."
    };
  }

  if (
    details.includes("schema cache")
    || details.includes("relation") && details.includes("does not exist")
    || details.includes("column") && details.includes("does not exist")
    || details.includes("database")
    || details.includes("migration")
    || details.includes("pgrst")
  ) {
    return {
      kind: "database",
      title: "Service temporarily unavailable",
      message: "The app cannot load this right now. Please try again shortly."
    };
  }

  if (
    details.includes("jwt")
    || details.includes("refresh token")
    || details.includes("session") && details.includes("expired")
    || details.includes("not authenticated")
    || details.includes("invalid authentication")
  ) {
    return {
      kind: "authentication",
      title: "Your session needs refreshing",
      message: "Sign in again, then return to this page."
    };
  }

  if (
    details.includes("row-level security")
    || details.includes("permission denied")
    || details.includes("not authorized")
    || details.includes("access required")
    || details.includes("not an active member")
  ) {
    return {
      kind: "permission",
      title: "League access is unavailable",
      message: "Your membership or role may have changed. Return to your leagues and choose one you can access."
    };
  }

  if (
    details.includes("timeout")
    || details.includes("timed out")
    || details.includes("statement timeout")
    || details.includes("canceling statement")
    || details.includes("taking too long")
  ) {
    return {
      kind: "timeout",
      title: "This is taking too long",
      message: "The request timed out. Check your connection, wait a moment, and try again."
    };
  }

  if (
    details.includes("status 500")
    || details.includes("status 502")
    || details.includes("status 503")
    || details.includes("status 504")
    || details.includes("internal server")
    || details.includes("bad gateway")
    || details.includes("service unavailable")
    || details.includes("gateway timeout")
  ) {
    return {
      kind: "server",
      title: "Service temporarily unavailable",
      message: "The app cannot complete this request right now. Please try again shortly."
    };
  }

  if (
    details.includes("failed to fetch")
    || details.includes("networkerror")
    || details.includes("network request failed")
    || details.includes("load failed")
    || details.includes("could not reach")
  ) {
    return {
      kind: "network",
      title: "Connection problem",
      message: "Check your internet connection, then try again."
    };
  }

  return {
    kind: "unknown",
    title: "This could not be loaded",
    message: fallback
  };
}

export function withLoadTimeout<T>(
  promise: Promise<T>,
  milliseconds = 15_000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("The request timed out while loading.")),
      milliseconds
    );
    promise.then(
      value => {
        clearTimeout(timeout);
        resolve(value);
      },
      error => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
