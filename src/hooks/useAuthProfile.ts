"use client";

import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/lib/types";

export function useAuthProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(currentUser: User | null) {
    setUser(currentUser);
    if (!currentUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

    if (!error && data) setProfile(data as Profile);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    // Restore the persisted browser session first. This is especially important
    // for an installed iOS Home Screen app, where each app origin has its own storage.
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) loadProfile(data.session?.user || null);
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session?.user || null);
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  return { user, profile, loading, reloadProfile: () => loadProfile(user) };
}
