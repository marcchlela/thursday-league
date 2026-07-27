const PRIVATE_PATH_PREFIXES = ["/admin", "/api"];
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;

export function redactObservabilityUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl, "https://thursday-league.invalid");
    if (PRIVATE_PATH_PREFIXES.some(prefix => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
      return null;
    }
    url.pathname = url.pathname.replace(UUID_SEGMENT, "/redacted-id");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
