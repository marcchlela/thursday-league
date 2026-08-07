import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import type { League, LeagueMembership } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type LeagueContextValue = {
  memberships: LeagueMembership[];
  leagues: League[];
  activeLeague: League | null;
  activeMembership: LeagueMembership | null;
  loading: boolean;
  switching: boolean;
  error: string | null;
  dataGeneration: number;
  refreshLeagues: (preferredLeagueId?: string) => Promise<void>;
  switchLeague: (leagueId: string) => Promise<League>;
};

const LeagueContext = createContext<LeagueContextValue | null>(null);

export function LeagueProvider({ children }: PropsWithChildren) {
  const { user, profile, refreshProfile } = useAuth();
  const [memberships, setMemberships] = useState<LeagueMembership[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeLeague, setActiveLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataGeneration, setDataGeneration] = useState(0);
  const requestId = useRef(0);

  const clearLeagueState = useCallback(() => {
    requestId.current += 1;
    setMemberships([]);
    setLeagues([]);
    setActiveLeague(null);
    setDataGeneration(value => value + 1);
  }, []);

  const refreshLeagues = useCallback(async (preferredLeagueId?: string) => {
    if (!user) {
      clearLeagueState();
      setLoading(false);
      return;
    }
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const membershipResult = await supabase
        .from('league_memberships')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true });
      if (membershipResult.error) throw membershipResult.error;
      const nextMemberships = (membershipResult.data || []) as LeagueMembership[];
      const ids = nextMemberships.map(item => item.league_id);
      const leagueResult = ids.length
        ? await supabase.from('leagues').select('*').in('id', ids).eq('status', 'active').order('name')
        : { data: [], error: null };
      if (leagueResult.error) throw leagueResult.error;
      if (currentRequest !== requestId.current) return;

      const nextLeagues = (leagueResult.data || []) as League[];
      const selectedId = preferredLeagueId || profile?.last_active_league_id;
      const selected = nextLeagues.find(item => item.id === selectedId) || nextLeagues[0] || null;
      setMemberships(nextMemberships);
      setLeagues(nextLeagues);
      setActiveLeague(selected);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError(friendlyMobileError(loadError, 'Your leagues could not be loaded.'));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [clearLeagueState, profile, user]);

  useEffect(() => {
    void Promise.resolve().then(() => refreshLeagues());
  }, [refreshLeagues]);

  const switchLeague = useCallback(async (leagueId: string) => {
    const target = leagues.find(item => item.id === leagueId);
    if (!target) throw new Error('That league is no longer available.');
    if (target.id === activeLeague?.id) return target;

    setSwitching(true);
    setError(null);
    requestId.current += 1;
    setActiveLeague(null);
    setMemberships([]);
    setLeagues([]);
    setDataGeneration(value => value + 1);
    try {
      const supabase = getSupabaseClient();
      const result = await supabase.rpc('set_active_league', { target_league_id: leagueId });
      if (result.error) throw result.error;
      await refreshProfile();
      await refreshLeagues(leagueId);
      return target;
    } catch (switchError) {
      await refreshLeagues();
      throw switchError;
    } finally {
      setSwitching(false);
    }
  }, [activeLeague?.id, leagues, refreshLeagues, refreshProfile]);

  const activeMembership = memberships.find(item => item.league_id === activeLeague?.id) || null;
  const value = useMemo<LeagueContextValue>(() => ({
    memberships,
    leagues,
    activeLeague,
    activeMembership,
    loading,
    switching,
    error,
    dataGeneration,
    refreshLeagues,
    switchLeague,
  }), [activeLeague, activeMembership, dataGeneration, error, leagues, loading, memberships, refreshLeagues, switchLeague, switching]);

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeagues() {
  const context = useContext(LeagueContext);
  if (!context) throw new Error('useLeagues must be used inside LeagueProvider.');
  return context;
}
