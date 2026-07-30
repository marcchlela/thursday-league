"use client";

import { useCallback, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/lib/types";
import { describeLoadProblem, LoadProblem, withLoadTimeout } from "@/lib/loadProblems";

export function useAuthProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadProblem | null>(null);

  const loadProfile = useCallback(async (currentUser: User | null) => {
    setUser(currentUser);
    setError(null);
    if (!currentUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error: profileError } = await withLoadTimeout(
        Promise.resolve(
          supabase
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .single()
        )
      );
      if (profileError || !data) {
        setProfile(null);
        setError(describeLoadProblem(
          profileError || "The profile record is unavailable.",
          "Your account profile could not be loaded. Try again."
        ));
      } else {
        setProfile(data as Profile);
      }
    } catch (profileError) {
      setProfile(null);
      setError(describeLoadProblem(profileError, "Your account profile could not be loaded. Try again."));
    }
    setLoading(false);
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await withLoadTimeout(
        supabase.auth.getSession()
      );
      if (sessionError) throw sessionError;
      await loadProfile(data.session?.user || null);
    } catch (sessionError) {
      setLoading(false);
      setError(describeLoadProblem(sessionError, "Your session could not be restored. Try again."));
    }
  }, [loadProfile]);

  useEffect(() => {
    // Restore the persisted browser session first. This is especially important
    // for an installed iOS Home Screen app, where each app origin has its own storage.
    void restoreSession();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadProfile(session?.user || null);
    });

    return () => {
      authSub.subscription.unsubscribe();
    };
  }, [loadProfile, restoreSession]);

  return {
    user,
    profile,
    loading,
    error,
    reloadProfile: restoreSession
  };
}
