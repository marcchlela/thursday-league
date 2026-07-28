const configuredUrl =
  process.env.PRODUCTION_APP_URL || process.env.NEXT_PUBLIC_APP_URL;

if (!configuredUrl) {
  throw new Error(
    "Set PRODUCTION_APP_URL or NEXT_PUBLIC_APP_URL before running the production smoke check."
  );
}

const baseUrl = new URL(configuredUrl);
if (baseUrl.protocol !== "https:") {
  throw new Error("Production smoke checks require an HTTPS app URL.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchChecked(pathname, expectedContentType) {
  const response = await fetch(new URL(pathname, baseUrl), {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Thursday-League-Reliability-Check/1.0" }
  });
  assert(response.ok, `${pathname} returned HTTP ${response.status}.`);
  assert(
    new URL(response.url).origin === baseUrl.origin,
    `${pathname} redirected outside the configured app origin.`
  );
  const contentType = response.headers.get("content-type") || "";
  assert(
    contentType.includes(expectedContentType),
    `${pathname} returned unexpected content type ${contentType || "(missing)"}.`
  );
  return response;
}

const login = await fetchChecked("/login", "text/html");
const requiredHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

for (const [name, expected] of Object.entries(requiredHeaders)) {
  assert(
    login.headers.get(name) === expected,
    `/login is missing the expected ${name} header.`
  );
}
assert(
  login.headers.get("strict-transport-security")?.includes("max-age="),
  "/login is missing production HSTS."
);
assert(
  !login.headers.has("x-powered-by"),
  "/login exposes the framework through X-Powered-By."
);
const csp =
  login.headers.get("content-security-policy") ||
  login.headers.get("content-security-policy-report-only") ||
  "";
assert(csp.includes("frame-ancestors 'none'"), "/login is missing the frame CSP.");
assert(csp.includes("object-src 'none'"), "/login is missing the object CSP.");
assert(
  csp.includes("report-uri /api/security/csp-report"),
  "/login is not sending legacy CSP reports to the application."
);
assert(
  login.headers
    .get("reporting-endpoints")
    ?.includes("/api/security/csp-report"),
  "/login is missing the CSP Reporting API endpoint."
);

const robots = await fetchChecked("/robots.txt", "text/plain");
assert(
  (await robots.text()).toLowerCase().includes("disallow: /"),
  "robots.txt no longer keeps the private app out of search results."
);

const manifest = await fetchChecked(
  "/manifest.webmanifest",
  "application/manifest+json"
);
const manifestBody = await manifest.json();
assert(
  manifestBody.name === "Thursday League",
  "The web manifest has an unexpected name."
);
assert(
  manifestBody.display === "standalone",
  "The web manifest is no longer installable."
);
assert(
  Array.isArray(manifestBody.icons) && manifestBody.icons.length >= 2,
  "The web manifest is missing required icons."
);

const worker = await fetchChecked("/sw.js", "javascript");
assert(
  (await worker.text()).length > 100,
  "The service worker response is unexpectedly empty."
);

console.log(
  `Production smoke check passed for ${baseUrl.origin}: login, security headers, robots, manifest, and service worker.`
);
