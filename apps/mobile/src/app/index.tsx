import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { Loading, Message, Screen, Button } from '@/components/ui';
import { getPendingInvite, introWasCompleted } from '@/lib/onboarding';
import { useAuth } from '@/providers/AuthProvider';
import { useLeagues } from '@/providers/LeagueProvider';

export default function EntryGate() {
  const router = useRouter();
  const auth = useAuth();
  const leagueState = useLeagues();
  const [checkingIntro, setCheckingIntro] = useState(true);
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    void introWasCompleted().then(value => {
      setIntroComplete(value);
      setCheckingIntro(false);
    });
  }, []);

  useEffect(() => {
    if (checkingIntro || auth.loading) return;
    if (!introComplete) {
      router.replace('/welcome');
      return;
    }
    if (!auth.session) {
      router.replace('/account');
      return;
    }
    if (leagueState.loading) return;
    void getPendingInvite().then(token => {
      if (token) {
        router.replace({ pathname: '/invite/[token]', params: { token } });
      } else if (!leagueState.leagues.length) {
        router.replace('/league-entry');
      } else if (leagueState.activeLeague) {
        router.replace({ pathname: '/l/[slug]', params: { slug: leagueState.activeLeague.slug } });
      }
    });
  }, [auth.loading, auth.session, checkingIntro, introComplete, leagueState.activeLeague, leagueState.leagues.length, leagueState.loading, router]);

  if (auth.error || leagueState.error) {
    return <Screen scroll={false}><Message tone="error">{auth.error || leagueState.error}</Message><Button onPress={() => { void auth.refreshProfile(); void leagueState.refreshLeagues(); }}>Try again</Button></Screen>;
  }
  return <Loading label={checkingIntro ? 'Preparing your welcome...' : 'Opening your matchweek...'} />;
}
