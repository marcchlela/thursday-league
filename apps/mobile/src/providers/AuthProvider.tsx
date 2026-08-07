import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { apiRequest, friendlyMobileError } from '@/lib/api';
import { unregisterNativePushToken } from '@/lib/notifications';
import { getSupabaseClient } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type AuthResult = { warning?: string | null; emailVerificationSent?: boolean };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn: (identity: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestRecovery: (username: string) => Promise<string>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type SessionResponse = {
  session: { access_token: string; refresh_token: string } | null;
  warning?: string | null;
  emailVerificationSent?: boolean;
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (currentSession: Session | null) => {
    setSession(currentSession);
    if (!currentSession) {
      setProfile(null);
      return;
    }
    setProfile(null);
    const supabase = getSupabaseClient();
    const result = await supabase.from('profiles').select('*').eq('id', currentSession.user.id).single();
    if (result.error || !result.data) throw new Error('Your account profile could not be loaded.');
    setProfile(result.data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      setError(null);
      const supabase = getSupabaseClient();
      const current = await supabase.auth.getSession();
      if (current.error) throw current.error;
      await loadProfile(current.data.session);
    } catch (loadError) {
      setError(friendlyMobileError(loadError, 'Your profile could not be refreshed.'));
    }
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch (configurationError) {
      void Promise.resolve().then(() => {
        setError(friendlyMobileError(configurationError, 'The app is not configured yet.'));
        setLoading(false);
      });
      return;
    }

    void supabase.auth.getSession().then(async result => {
      if (!mounted) return;
      try {
        if (result.error) throw result.error;
        await loadProfile(result.data.session);
      } catch (loadError) {
        if (mounted) setError(friendlyMobileError(loadError, 'Your secure session could not be restored.'));
      } finally {
        if (mounted) setLoading(false);
      }
    });

    const authSubscription = supabase.auth.onAuthStateChange((event, nextSession) => {
      setLoading(false);
      setSession(nextSession);
      if (!nextSession) setProfile(null);
      if (event === 'TOKEN_REFRESHED') return;
      setTimeout(() => {
        if (!mounted) return;
        void loadProfile(nextSession).catch(loadError => {
          if (mounted) setError(friendlyMobileError(loadError, 'Your account profile could not be loaded.'));
        });
      }, 0);
    });
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      mounted = false;
      authSubscription.data.subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [loadProfile]);

  const installSession = useCallback(async (response: SessionResponse) => {
    if (!response.session) throw new Error(response.warning || 'Your account is ready. Log in to continue.');
    const supabase = getSupabaseClient();
    const result = await supabase.auth.setSession(response.session);
    if (result.error) throw result.error;
    await loadProfile(result.data.session);
  }, [loadProfile]);

  const signIn = useCallback(async (identity: string, password: string) => {
    setError(null);
    const response = await apiRequest<SessionResponse>({
      path: '/api/auth/session',
      body: { identity, password },
    });
    await installSession(response);
  }, [installSession]);

  const signUp = useCallback(async (username: string, email: string, password: string) => {
    setError(null);
    const response = await apiRequest<SessionResponse>({
      path: '/api/auth/signup',
      body: { username, email, password, platform: 'mobile' },
      timeoutMs: 20000,
    });
    await installSession(response);
    return {
      warning: response.warning,
      emailVerificationSent: response.emailVerificationSent,
    };
  }, [installSession]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (session) await unregisterNativePushToken(session.access_token).catch(() => undefined);
    const result = await supabase.auth.signOut();
    if (result.error) throw result.error;
    setProfile(null);
    setSession(null);
  }, [session]);

  const requestRecovery = useCallback(async (username: string) => {
    const response = await apiRequest<{ message: string }>({
      path: '/api/auth/recovery',
      body: { username, platform: 'mobile' },
    });
    return response.message;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user || null,
    profile,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    requestRecovery,
    refreshProfile,
  }), [error, loading, profile, refreshProfile, requestRecovery, session, signIn, signOut, signUp]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
