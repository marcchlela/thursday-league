import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, Eyebrow, Field, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { BetSlip, BettingMarket, BettingOutcome, BettingWallet, Game, Season } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Tab = 'markets' | 'mine' | 'standings';
type Availability = { enabled: boolean; unlocked: boolean; completed_games: number; required_games: number };
type Settings = { starting_balance_units: number; lock_minutes: number; builder_margin: number; max_builder_selections: number };
type Standing = { user_id: string; username: string; balance_units: number; settled_profit_units: number; total_bets: number; settled_bets: number; won_bets: number };

export default function BetsScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const { league, loading: leagueLoading, switching } = useScopedLeague(slug);
  const [tab, setTab] = useState<Tab>('markets');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [markets, setMarkets] = useState<BettingMarket[]>([]);
  const [outcomes, setOutcomes] = useState<BettingOutcome[]>([]);
  const [wallets, setWallets] = useState<BettingWallet[]>([]);
  const [slips, setSlips] = useState<BetSlip[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [gameId, setGameId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [stake, setStake] = useState('');
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('error');
  const [now, setNow] = useState(() => Date.now());
  const walletAttempts = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!league || !user) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const responses = await Promise.all([
      supabase.rpc('league_betting_availability', { target_league_id: league.id }),
      supabase.rpc('get_league_betting_public_settings', { target_league_id: league.id }).maybeSingle(),
      supabase.from('games').select('*').eq('league_id', league.id).order('game_date'),
      supabase.from('seasons').select('*').eq('league_id', league.id).order('start_date', { ascending: false }),
      supabase.from('betting_markets').select('*').eq('league_id', league.id).neq('status', 'draft').order('created_at'),
      supabase.from('betting_outcomes').select('*').eq('league_id', league.id).order('created_at'),
      supabase.from('betting_wallets').select('*').eq('league_id', league.id).eq('user_id', user.id),
      supabase.from('bet_slips').select('*').eq('league_id', league.id).eq('user_id', user.id).order('placed_at', { ascending: false }),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) {
      setMessageTone('error');
      setMessage(friendlyMobileError(failure, 'Prediction markets could not be loaded.'));
      return;
    }
    const availabilityRow = Array.isArray(responses[0].data) ? responses[0].data[0] : responses[0].data;
    const nextGames = (responses[2].data || []) as Game[];
    const nextMarkets = (responses[4].data || []) as BettingMarket[];
    setAvailability((availabilityRow || null) as Availability | null);
    setSettings((responses[1].data || null) as Settings | null);
    setGames(nextGames);
    setSeasons((responses[3].data || []) as Season[]);
    setMarkets(nextMarkets);
    setOutcomes((responses[5].data || []) as BettingOutcome[]);
    setWallets((responses[6].data || []) as BettingWallet[]);
    setSlips((responses[7].data || []) as BetSlip[]);
    const availableIds = new Set(nextMarkets.map(item => item.game_id));
    const preferred = nextGames.find(item => availableIds.has(item.id) && (item.status === 'draft' || item.status === 'upcoming')) || nextGames.find(item => availableIds.has(item.id));
    setGameId(current => availableIds.has(current) ? current : preferred?.id || '');
  }, [league, user]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const game = games.find(item => item.id === gameId) || null;
  const gameMarkets = markets.filter(item => item.game_id === gameId && !item.invalidated);
  const gameOutcomes = outcomes.filter(outcome => gameMarkets.some(market => market.id === outcome.market_id));
  const selectedOutcomes = selected.map(id => gameOutcomes.find(item => item.id === id)).filter(Boolean) as BettingOutcome[];
  const odds = builderOdds(selectedOutcomes.map(item => Number(item.offered_odds)), Number(settings?.builder_margin ?? 0.1));
  const wallet = wallets.find(item => item.season_id === game?.season_id) || wallets[0];
  const balanceUnits = wallet?.balance_units ?? settings?.starting_balance_units ?? 10000;
  const stakeCoins = Number(stake || 0);
  const lockAt = game ? new Date(game.game_date).getTime() - Number(settings?.lock_minutes ?? 5) * 60_000 : 0;
  const open = !!game && now < lockAt && gameMarkets.some(item => item.status === 'open');

  useEffect(() => {
    if (!game?.season_id || wallets.some(item => item.season_id === game.season_id)) return;
    if (walletAttempts.current.has(game.season_id)) return;
    walletAttempts.current.add(game.season_id);
    void getSupabaseClient().rpc('ensure_betting_wallet', { target_season_id: game.season_id }).then(result => {
      if (result.error) {
        setMessageTone('error');
        setMessage(friendlyMobileError(result.error, 'Your prediction balance could not be prepared.'));
        return;
      }
      return load();
    });
  }, [game?.season_id, load, wallets]);

  useEffect(() => {
    if (tab !== 'standings' || !league) return;
    const seasonId = game?.season_id || seasons[0]?.id;
    if (!seasonId) return;
    void getSupabaseClient().rpc('get_betting_standings', { target_season_id: seasonId }).then(result => {
      if (!result.error) setStandings((result.data || []) as Standing[]);
    });
  }, [game?.season_id, league, seasons, tab]);

  function toggle(outcome: BettingOutcome) {
    if (!open) return;
    const market = gameMarkets.find(item => item.id === outcome.market_id);
    if (!market) return;
    setSelected(current => {
      if (current.includes(outcome.id)) return current.filter(id => id !== outcome.id);
      const group = `${market.market_type}:${market.subject_player_id || market.subject_team || 'game'}`;
      const withoutGroup = current.filter(id => {
        const existingOutcome = gameOutcomes.find(item => item.id === id);
        const existingMarket = gameMarkets.find(item => item.id === existingOutcome?.market_id);
        return existingMarket && `${existingMarket.market_type}:${existingMarket.subject_player_id || existingMarket.subject_team || 'game'}` !== group;
      });
      if (withoutGroup.length >= Number(settings?.max_builder_selections ?? 5)) {
        setMessageTone('error');
        setMessage(`Choose up to ${settings?.max_builder_selections ?? 5} compatible outcomes.`);
        return current;
      }
      return [...withoutGroup, outcome.id];
    });
  }

  function addStake(amount: number) {
    const current = Number(stake || 0);
    setStake(String(Math.min(current + amount, balanceUnits / 100)));
  }

  async function place() {
    if (!game || !selected.length) return;
    if (!Number.isFinite(stakeCoins) || stakeCoins <= 0 || Math.round(stakeCoins * 100) !== stakeCoins * 100) {
      setMessageTone('error');
      return setMessage('Enter a positive stake with up to two decimals.');
    }
    if (stakeCoins * 100 > balanceUnits) {
      setMessageTone('error');
      return setMessage('You do not have enough league coins for that stake.');
    }
    setPlacing(true);
    setMessage(null);
    const result = await getSupabaseClient().rpc('place_league_bet', {
      target_game_id: game.id,
      selected_outcome_ids: selected,
      stake_coins: stakeCoins,
      client_request_id: Crypto.randomUUID(),
    });
    setPlacing(false);
    if (result.error) {
      setMessageTone('error');
      setMessage(friendlyMobileError(result.error, 'Your prediction could not be placed.'));
      return;
    }
    setSelected([]);
    setStake('');
    setMessageTone('success');
    setMessage(`${selected.length === 1 ? 'Prediction' : 'Builder'} placed at ${odds.toFixed(2)} odds.`);
    await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading predictions..." />;
  if (!league.betting_enabled) return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><Message>Predictions are turned off for this league.</Message></Screen>;

  return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><View style={styles.playSwitch}><Pressable onPress={() => router.push(`/l/${league.slug}/fantasy`)} style={styles.playTab}><Text style={styles.playTabText}>Fantasy</Text></Pressable><Pressable style={[styles.playTab, styles.playTabActive]}><Text style={styles.playTabActiveText}>Predictions</Text></Pressable></View><Eyebrow>VIRTUAL LEAGUE COINS</Eyebrow><Title>{tab === 'markets' ? 'Predictions.' : tab === 'mine' ? 'My predictions.' : 'Standings.'}</Title><Body>No real money. Markets and balances belong only to {league.name}.</Body><View style={styles.tabs}>{(['markets', 'mine', 'standings'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'markets' ? 'Markets' : item === 'mine' ? 'My bets' : 'Table'}</Text></Pressable>)}</View>{message ? <Message tone={messageTone}>{message}</Message> : null}{loading ? <Card><Text style={styles.muted}>Loading markets...</Text></Card> : availability && !availability.unlocked ? <Card><Text style={styles.lockTitle}>Predictions unlock after 3 completed games.</Text><Text style={styles.progress}>{availability.completed_games}/{availability.required_games}</Text><Text style={styles.muted}>{Math.max(availability.required_games - availability.completed_games, 0)} game{Math.max(availability.required_games - availability.completed_games, 0) === 1 ? '' : 's'} left to unlock predictions.</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, availability.required_games ? availability.completed_games / availability.required_games * 100 : 100)}%` }]} /></View><Button variant="secondary" onPress={() => router.push(`/l/${league.slug}/games`)}>View games</Button></Card> : tab === 'markets' ? <><Card><View style={styles.balanceRow}><View><Text style={styles.balanceLabel}>BALANCE</Text><Text style={styles.balance}>{formatCoins(balanceUnits)} coins</Text></View><Text style={[styles.openStatus, !open && styles.closed]}>{open ? 'Open' : 'Locked'}</Text></View>{games.filter(item => markets.some(market => market.game_id === item.id)).map(item => <Pressable key={item.id} onPress={() => { setGameId(item.id); setSelected([]); setStake(''); }} style={[styles.gameChoice, item.id === gameId && styles.gameChoiceActive]}><Text style={styles.gameChoiceName}>Team A vs Team B</Text><Text style={styles.muted}>{formatMatchTime(item.game_date)}</Text></Pressable>)}</Card>{game ? <><Card><Text style={styles.marketGame}>Team A vs Team B</Text><Text style={styles.muted}>{formatMatchTime(game.game_date)} · locks {settings?.lock_minutes ?? 5} minutes before kickoff</Text></Card>{gameMarkets.length ? gameMarkets.map(market => <Card key={market.id} style={styles.marketCard}><Text style={styles.marketTitle}>{market.title}</Text><View style={styles.outcomes}>{gameOutcomes.filter(item => item.market_id === market.id).map(outcome => { const chosen = selected.includes(outcome.id); return <Pressable key={outcome.id} disabled={!open} onPress={() => toggle(outcome)} style={[styles.outcome, chosen && styles.outcomeChosen, !open && styles.outcomeDisabled]}><Text style={[styles.outcomeLabel, chosen && styles.outcomeChosenText]}>{outcome.label}</Text><Text style={[styles.outcomeOdds, chosen && styles.outcomeChosenText]}>{Number(outcome.offered_odds).toFixed(2)}</Text></Pressable>; })}</View></Card>) : <Card><Text style={styles.muted}>No public markets are available for this game.</Text></Card>}{selected.length ? <Card><Text style={styles.slipTitle}>{selected.length === 1 ? 'Single prediction' : `${selected.length}-pick builder`}</Text><Text style={styles.odds}>Odds {odds.toFixed(2)}</Text><Field label="Stake in coins" value={stake} onChangeText={setStake} keyboardType="decimal-pad" placeholder="0" /><View style={styles.quick}>{[5, 10, 25].map(amount => <Pressable key={amount} onPress={() => addStake(amount)} style={styles.quickButton}><Text style={styles.quickText}>+{amount}</Text></Pressable>)}</View><Text style={styles.return}>Potential return: {stakeCoins > 0 ? (stakeCoins * odds).toFixed(2) : '0'} coins</Text><Button onPress={place} disabled={placing || !open}>{placing ? 'Placing...' : 'Place prediction'}</Button></Card> : null}</> : null}</> : tab === 'mine' ? <Card><Text style={styles.slipTitle}>My bets only</Text>{slips.length ? slips.map(slip => <View key={slip.id} style={styles.betRow}><View style={styles.betCopy}><Text style={styles.betTitle}>{slip.slip_type === 'builder' ? 'Same-game builder' : 'Single prediction'}</Text><Text style={styles.muted}>{formatMatchTime(slip.placed_at)} · {formatCoins(slip.stake_units)} coin stake</Text></View><View><Text style={[styles.betStatus, slip.status === 'won' && styles.won]}>{slip.status}</Text><Text style={styles.betOdds}>{Number(slip.accepted_odds).toFixed(2)}</Text></View></View>) : <Text style={styles.muted}>You have not placed any predictions in this league.</Text>}</Card> : <Card><Text style={styles.slipTitle}>Prediction table</Text>{standings.length ? standings.map((row, index) => <View key={row.user_id} style={[styles.boardRow, row.user_id === user?.id && styles.boardMe]}><Text style={styles.rank}>#{index + 1}</Text><View style={styles.boardCopy}><Text style={styles.boardName}>{row.username}{row.user_id === user?.id ? ' · you' : ''}</Text><Text style={styles.muted}>{row.won_bets}/{row.settled_bets} won</Text></View><Text style={styles.points}>{formatCoins(row.balance_units)}</Text></View>) : <Text style={styles.muted}>Standings appear after league members place predictions.</Text>}</Card>}<Button variant="secondary" onPress={load}>Refresh predictions</Button></Screen>;
}

function builderOdds(values: number[], margin: number) {
  if (!values.length) return 1;
  const product = values.reduce((total, value) => total * value, 1);
  return values.length === 1 ? product : Math.max(1.01, 1 + (product - 1) * (1 - margin));
}

function formatCoins(units: number) { return (units / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

const styles = StyleSheet.create({
  playSwitch: { flexDirection: 'row', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, padding: 4, backgroundColor: colors.ink850 },
  playTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm }, playTabActive: { backgroundColor: colors.ink800 }, playTabText: { color: colors.chalkMuted, fontWeight: '800' }, playTabActiveText: { color: colors.gold, fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, padding: 4 }, tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm }, tabActive: { backgroundColor: colors.gold }, tabText: { color: colors.chalkMuted, fontSize: 11, fontWeight: '800' }, tabTextActive: { color: colors.ink900 },
  muted: { color: colors.chalkMuted, fontSize: 11, lineHeight: 16 }, lockTitle: { color: colors.chalk, fontSize: 19, fontWeight: '900', textAlign: 'center' }, progress: { color: colors.gold, fontSize: 34, fontWeight: '900', textAlign: 'center' }, progressTrack: { height: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: colors.ink800 }, progressFill: { height: '100%', backgroundColor: colors.gold },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, balanceLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 2 }, balance: { marginTop: 3, color: colors.chalk, fontSize: 23, fontWeight: '900' }, openStatus: { color: colors.turf400, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }, closed: { color: colors.danger },
  gameChoice: { padding: spacing.sm, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.sm }, gameChoiceActive: { backgroundColor: colors.ink800, borderColor: colors.gold }, gameChoiceName: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, marketGame: { color: colors.chalk, fontSize: 20, fontWeight: '900' }, marketCard: { padding: spacing.md }, marketTitle: { color: colors.chalk, fontSize: 15, fontWeight: '900' }, outcomes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, outcome: { flexGrow: 1, minWidth: '44%', minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.sm, backgroundColor: colors.ink800, paddingHorizontal: spacing.sm }, outcomeChosen: { borderColor: colors.gold, backgroundColor: colors.gold }, outcomeDisabled: { opacity: 0.45 }, outcomeLabel: { flex: 1, color: colors.chalk, fontSize: 11, fontWeight: '800' }, outcomeOdds: { color: colors.gold, fontSize: 12, fontWeight: '900' }, outcomeChosenText: { color: colors.ink900 },
  slipTitle: { color: colors.chalk, fontSize: 19, fontWeight: '900' }, odds: { color: colors.gold, fontSize: 16, fontWeight: '900' }, quick: { flexDirection: 'row', gap: spacing.sm }, quickButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.sm }, quickText: { color: colors.gold, fontWeight: '900' }, return: { color: colors.chalkMuted, fontSize: 12 }, betRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, betCopy: { flex: 1 }, betTitle: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, betStatus: { color: colors.gold, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', textAlign: 'right' }, won: { color: colors.turf400 }, betOdds: { marginTop: 3, color: colors.chalk, fontSize: 12, fontWeight: '900', textAlign: 'right' }, boardRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldMuted }, boardMe: { backgroundColor: colors.ink800 }, rank: { width: 32, color: colors.gold, fontSize: 12, fontWeight: '900' }, boardCopy: { flex: 1 }, boardName: { color: colors.chalk, fontSize: 13, fontWeight: '800' }, points: { color: colors.gold, fontSize: 14, fontWeight: '900' },
});
