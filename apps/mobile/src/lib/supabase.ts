import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { requireMobileEnvironment } from '@/lib/env';

let mobileSupabase: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (mobileSupabase) return mobileSupabase;

  const environment = requireMobileEnvironment();

  mobileSupabase = createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return mobileSupabase;
}
