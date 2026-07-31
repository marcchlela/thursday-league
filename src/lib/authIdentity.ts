export const USERNAME_PATTERN = /^[a-z0-9_]{2,32}$/;
export const MINIMUM_PASSWORD_LENGTH = 8;
export const MAXIMUM_PASSWORD_LENGTH = 128;

export type AuthPlatform = "web" | "mobile";
export type AuthEmailFlow = "verify-email" | "recover-password";

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const separator = email.lastIndexOf("@");
  return separator > 0
    && separator < email.length - 1
    && email.slice(separator + 1).includes(".");
}

export function internalEmailForUsername(username: string, supabaseUrl: string) {
  return `${normalizeUsername(username)}@${new URL(supabaseUrl).hostname.toLowerCase()}`;
}

export function isInternalAuthEmail(email: string | null | undefined, supabaseUrl: string) {
  if (!email) return false;
  const domain = new URL(supabaseUrl).hostname.toLowerCase();
  return normalizeEmail(email).endsWith(`@${domain}`);
}

export function parseAuthPlatform(value: unknown): AuthPlatform {
  return value === "mobile" ? "mobile" : "web";
}

export function authEmailRedirect({
  platform,
  flow,
  appUrl
}: {
  platform: AuthPlatform;
  flow: AuthEmailFlow;
  appUrl?: string;
}) {
  const query = `flow=${encodeURIComponent(flow)}`;
  if (platform === "mobile") return `thursdayleague://auth/confirm?${query}`;

  if (!appUrl) throw new Error("The public app URL is not configured.");
  const destination = new URL("/auth/confirm", appUrl);
  destination.searchParams.set("flow", flow);
  return destination.toString();
}
