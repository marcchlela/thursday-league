import { requireMobileEnvironment } from '@/lib/env';

export function isInternalLoginEmail(email?: string | null) {
  if (!email) return false;
  const domain = new URL(requireMobileEnvironment().supabaseUrl).hostname.toLowerCase();
  return email.trim().toLowerCase().endsWith(`@${domain}`);
}
