import "server-only";

import { createClient, type Session } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "./supabaseAdmin";

function publicAuthConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Server-side authentication configuration is missing.");
  return { url, key };
}

export function createServerAuthClient() {
  const { url, key } = publicAuthConfiguration();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export async function resolveUsernameIdentity(username: string) {
  const admin = createSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, username, account_status")
    .eq("username", username)
    .maybeSingle();
  if (profileError || !profile) return null;

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(profile.id);
  const email = authUser.user?.email;
  if (authError || !email) return null;

  return {
    id: profile.id as string,
    username: profile.username as string,
    accountStatus: profile.account_status as string,
    email
  };
}

export function publicSession(session: Session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user
  };
}

export function noStoreJsonHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache"
  };
}
