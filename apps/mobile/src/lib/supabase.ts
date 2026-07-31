import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';

import { requireMobileEnvironment } from '@/lib/env';

let mobileSupabase: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (mobileSupabase) return mobileSupabase;

  const environment = requireMobileEnvironment();

  mobileSupabase = createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });

  return mobileSupabase;
}
