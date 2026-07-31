const mobileEnvironment = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() ?? '',
  webUrl: process.env.EXPO_PUBLIC_WEB_URL?.trim() ?? '',
};

type MobileEnvironmentKey = keyof typeof mobileEnvironment;

const labels: Record<MobileEnvironmentKey, string> = {
  supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL',
  supabasePublishableKey: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  apiUrl: 'EXPO_PUBLIC_API_URL',
  webUrl: 'EXPO_PUBLIC_WEB_URL',
};

export function getMobileEnvironmentStatus() {
  const missing = (Object.entries(mobileEnvironment) as [MobileEnvironmentKey, string][])
    .filter(([, value]) => !value)
    .map(([key]) => labels[key]);

  return {
    configured: missing.length === 0,
    missing,
  };
}

export function requireMobileEnvironment() {
  const status = getMobileEnvironmentStatus();

  if (!status.configured) {
    throw new Error(`Mobile environment is incomplete: ${status.missing.join(', ')}`);
  }

  return mobileEnvironment as { [Key in MobileEnvironmentKey]: string };
}
