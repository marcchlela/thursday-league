import { useEffect, useMemo, useState } from 'react';

import { friendlyMobileError } from '@/lib/api';
import { useLeagues } from '@/providers/LeagueProvider';

export function useScopedLeague(slug: string | undefined) {
  const state = useLeagues();
  const { activeLeague, error: leagueError, leagues, loading, switching, switchLeague } = state;
  const [error, setError] = useState<string | null>(null);
  const target = useMemo(() => leagues.find(item => item.slug === slug) || null, [leagues, slug]);

  useEffect(() => {
    if (!target || loading || switching || activeLeague?.id === target.id) return;
    void Promise.resolve().then(() => switchLeague(target.id)).catch(switchError => {
      setError(friendlyMobileError(switchError, 'That league could not be opened.'));
    });
  }, [activeLeague?.id, loading, switching, switchLeague, target]);

  return {
    ...state,
    league: activeLeague?.slug === slug ? activeLeague : null,
    membership: activeLeague?.slug === slug ? state.activeMembership : null,
    error: error || leagueError,
  };
}
