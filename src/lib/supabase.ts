import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const hasPlaceholderConfig =
  supabaseUrl?.includes("your-project-ref") ||
  supabaseAnonKey?.includes("your-supabase-anon-key");

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server."
    : hasPlaceholderConfig
      ? "Supabase is still using the example values in .env.local. Replace them with your project URL and anon key, then restart the dev server."
      : null;

if (supabaseConfigError) {
  // Next still imports files during build, so keep this clear for setup mistakes.
  console.warn(supabaseConfigError);
}

const authEmailDomain = (() => {
  if (!supabaseUrl) return "supabase.co";

  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return "supabase.co";
  }
})();

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

export function usernameToEmail(username: string) {
  const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return `${cleaned}@${authEmailDomain}`;
}

export function cleanUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}
