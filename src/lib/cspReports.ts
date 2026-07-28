const UUID_SEGMENT =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;

export type NormalizedCspReport = {
  effectiveDirective: string;
  disposition?: string;
  document?: string;
  blocked?: string;
  source?: string;
  line?: number;
  column?: number;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, maximum = 160) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\r\n\t]/g, " ").trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function safeUrl(value: unknown, appOrigin: string) {
  if (typeof value !== "string") return undefined;
  if (value === "inline" || value === "eval" || value === "self") return value;
  if (value.startsWith("data:")) return "data:";
  if (value.startsWith("blob:")) return "blob:";
  try {
    const url = new URL(value, appOrigin);
    if (!["http:", "https:"].includes(url.protocol)) return url.protocol;
    if (url.origin !== appOrigin) return url.origin;
    return url.pathname.replace(UUID_SEGMENT, "/redacted-id").slice(0, 240);
  } catch {
    return undefined;
  }
}

function numericValue(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined;
}

function normalizeBody(
  value: unknown,
  appOrigin: string
): NormalizedCspReport | null {
  const source = recordValue(value);
  if (!source) return null;

  const effectiveDirective = boundedText(
    source.effectiveDirective ||
      source["effective-directive"] ||
      source.violatedDirective ||
      source["violated-directive"]
  );
  if (!effectiveDirective) return null;

  return {
    effectiveDirective,
    disposition: boundedText(source.disposition, 32),
    document: safeUrl(
      source.documentURL ||
        source.documentUri ||
        source["document-uri"],
      appOrigin
    ),
    blocked: safeUrl(
      source.blockedURL ||
        source.blockedUri ||
        source["blocked-uri"],
      appOrigin
    ),
    source: safeUrl(
      source.sourceFile || source["source-file"],
      appOrigin
    ),
    line: numericValue(source.lineNumber ?? source["line-number"]),
    column: numericValue(source.columnNumber ?? source["column-number"])
  };
}

export function normalizeCspReports(
  payload: unknown,
  appOrigin: string
): NormalizedCspReport[] {
  const payloadRecord = recordValue(payload);
  const candidates = Array.isArray(payload)
    ? payload.map(item => recordValue(item)?.body)
    : [
        payloadRecord?.["csp-report"] ||
          payloadRecord?.body ||
          payload
      ];

  return candidates
    .slice(0, 10)
    .map(candidate => normalizeBody(candidate, appOrigin))
    .filter((report): report is NormalizedCspReport => report !== null);
}
