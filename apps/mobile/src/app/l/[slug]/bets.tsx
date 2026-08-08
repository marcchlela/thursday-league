import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { BetSlipDrawer, MarketSections } from '@/components/BettingMarkets';
import { LeagueHeader, LeagueNav } from '@/components/LeagueChrome';
import { Body, Button, Card, EmptyState, Eyebrow, Icon, Loading, Message, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { formatMatchTime } from '@/lib/scoring';
import { getSupabaseClient } from '@/lib/supabase';
import type { BetSlip, BettingMarket, BettingOutcome, BettingWallet, Game, GameLineup, Season } from '@/lib/types';
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
  const [lineups, setLineups] = useState<GameLineup[]>([]);
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
      supabase.from('game_lineups').select('*').eq('league_id', league.id),
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
    const nextMarkets = (responses[5].data || []) as BettingMarket[];
    setAvailability((availabilityRow || null) as Availability | null);
    setSettings((responses[1].data || null) as Settings | null);
    setGames(nextGames);
    setLineups((responses[3].data || []) as GameLineup[]);
    setSeasons((responses[4].data || []) as Season[]);
    setMarkets(nextMarkets);
    setOutcomes((responses[6].data || []) as BettingOutcome[]);
    setWallets((responses[7].data || []) as BettingWallet[]);
    setSlips((responses[8].data || []) as BetSlip[]);
    const availableIds = new Set(nextMarkets.map(item => item.game_id));
    const preferred = nextGames.find(item => availableIds.has(item.id) && (item.status === 'draft' || item.status === 'upcoming')) || nextGames.find(item => availableIds.has(item.id));
    setGameId(current => availableIds.has(current) ? current : preferred?.id || '');
  }, [league, user]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);

  const game = games.find(item => item.id === gameId) || null;
  const gameMarkets = markets.filter(item => item.game_id === gameId && !item.invalidated);
  const gameOutcomes = outcomes.filter(outcome => gameMarkets.some(market => market.id === outcome.market_id));
  const selectedOutcomes = selected.map(id => gameOutcomes.find(item => item.id === id)).filter((row): row is BettingOutcome => !!row);
  const odds = builderOdds(selectedOutcomes.map(item => Number(item.offered_odds)), Number(settings?.builder_margin ?? 0.1));
  const wallet = wallets.find(item => item.season_id === game?.season_id) || wallets[0];
  const balanceUnits = wallet?.balance_units ?? settings?.starting_balance_units ?? 10000;
  const stakeCoins = Number(stake || 0);
  const lockAt = game ? new Date(game.game_date).getTime() - Number(settings?.lock_minutes ?? 5) * 60_000 : 0;
  const open = !!game && now < lockAt && gameMarkets.some(item => item.status === 'open');
  const countdown = lockAt > now ? formatCountdown(lockAt - now) : '';

  useEffect(() => {
    if (!game?.season_id || wallets.some(item => item.season_id === game.season_id) || walletAttempts.current.has(game.season_id)) return;
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
    void getSupabaseClient().rpc('get_betting_standings', { target_season_id: seasonId }).then(result => { if (!result.error) setStandings((result.data || []) as Standing[]); });
  }, [game?.season_id, league, seasons, tab]);

  function toggle(outcome: BettingOutcome) {
    if (!open) return;
    const market = gameMarkets.find(item => item.id === outcome.market_id);
    if (!market) return;
    setSelected(current => {
      if (current.includes(outcome.id)) return current.filter(id => id !== outcome.id);
      const group = `${market.market_type}:${market.subject_player_id || market.subject_team || 'game'}`;
      const compatible = current.filter(id => {
        const existingOutcome = gameOutcomes.find(item => item.id === id);
        const existing = gameMarkets.find(item => item.id === existingOutcome?.market_id);
        return existing && `${existing.market_type}:${existing.subject_player_id || existing.subject_team || 'game'}` !== group;
      });
      if (compatible.length >= Number(settings?.max_builder_selections ?? 5)) {
        setMessageTone('error'); setMessage(`Choose up to ${settings?.max_builder_selections ?? 5} compatible outcomes.`); return current;
      }
      return [...compatible, outcome.id];
    });
  }

  async function place() {
    if (!game || !selected.length) return;
    if (!Number.isFinite(stakeCoins) || stakeCoins <= 0 || Math.round(stakeCoins * 100) !== stakeCoins * 100) { setMessageTone('error'); return setMessage('Enter a positive stake with up to two decimals.'); }
    if (stakeCoins * 100 > balanceUnits) { setMessageTone('error'); return setMessage('You do not have enough league coins for that stake.'); }
    setPlacing(true); setMessage(null);
    const result = await getSupabaseClient().rpc('place_league_bet', { target_game_id: game.id, selected_outcome_ids: selected, stake_coins: stakeCoins, client_request_id: Crypto.randomUUID() });
    setPlacing(false);
    if (result.error) { setMessageTone('error'); setMessage(friendlyMobileError(result.error, 'Your prediction could not be placed.')); return; }
    setSelected([]); setStake(''); setMessageTone('success'); setMessage(`${selected.length === 1 ? 'Prediction' : 'Builder'} placed at ${odds.toFixed(2)} odds.`); await load();
  }

  if (leagueLoading || switching || !league) return <Loading label="Loading predictions..." />;
  if (!league.betting_enabled) return <Screen><LeagueHeader league={league} /><LeagueNav league={league} /><EmptyState title="Predictions are off" text="Predictions are not enabled for this league." /></Screen>;

  const drawer = tab === 'markets' && selectedOutcomes.length ? <View style={styles.bottom}><BetSlipDrawer markets={gameMarkets} outcomes={selectedOutcomes} odds={odds} stake={stake} potentialReturn={stakeCoins * odds} balanceUnits={balanceUnits} disabled={!open} placing={placing} onStake={setStake} onRemove={id => setSelected(rows => rows.filter(row => row !== id))} onPlace={place} /><LeagueNav league={league} /></View> : <LeagueNav league={league} />;

  return (
    <Screen header={<LeagueHeader league={league} />} bottomBar={drawer} compact>
      <View style={styles.playSwitch}><Pressable onPress={() => router.push(`/l/${league.slug}/fantasy`)} style={styles.playTab}><Text style={styles.playTabText}>Fantasy</Text></Pressable><Pressable style={[styles.playTab, styles.playTabActive]}><Text style={styles.playTabActiveText}>Predictions</Text></Pressable></View>
      <View style={styles.intro}><Eyebrow>VIRTUAL LEAGUE COINS</Eyebrow><Title>{tab === 'markets' ? 'Predictions.' : tab === 'mine' ? 'My predictions.' : 'Standings.'}</Title><Body>No real money. Markets and balances stay inside {league.name}.</Body></View>
      <View style={styles.tabs}>{(['markets', 'mine', 'standings'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'markets' ? 'Markets' : item === 'mine' ? 'My bets' : 'Table'}</Text></Pressable>)}</View>
      {message ? <Message tone={messageTone}>{message}</Message> : null}
      {loading ? <Card><Text style={styles.muted}>Loading markets...</Text></Card> : availability && !availability.unlocked ? <UnlockCard availability={availability} onGames={() => router.push(`/l/${league.slug}/games`)} /> : null}
      {!loading && (!availability || availability.unlocked) && tab === 'markets' ? <><BettingBalance balanceUnits={balanceUnits} open={open} countdown={countdown} lockMinutes={settings?.lock_minutes ?? 5} />{games.filter(item => markets.some(market => market.game_id === item.id)).length ? <View style={styles.gameChoices}>{games.filter(item => markets.some(market => market.game_id === item.id)).map(item => <Pressable key={item.id} onPress={() => { setGameId(item.id); setSelected([]); setStake(''); }} style={[styles.gameChoice, item.id === gameId && styles.gameChoiceActive]}><Text style={[styles.gameChoiceDate, item.id === gameId && styles.gameChoiceDateActive]}>{fixtureDate(item.game_date)}</Text><Text style={styles.gameChoiceTime}>{item.status === 'live' ? 'Live' : fixtureTime(item.game_date)}</Text></Pressable>)}</View> : null}{game ? <Card style={styles.gameHead}><Text style={styles.gameTitle}>TEAM A VS TEAM B</Text><Text style={styles.muted}>{formatMatchTime(game.game_date)} · locks {settings?.lock_minutes ?? 5} minutes before kickoff</Text></Card> : null}{gameMarkets.length ? <MarketSections markets={gameMarkets} outcomes={gameOutcomes} lineups={lineups.filter(row => row.game_id === gameId)} selected={selected} disabled={!open} onToggle={toggle} /> : <EmptyState title="No markets available" text="Markets appear automatically after valid lineups are saved." />}</> : null}
      {!loading && tab === 'mine' ? <MyBets slips={slips} /> : null}
      {!loading && tab === 'standings' ? <BettingStandings standings={standings} userId={user?.id} /> : null}
      <Button variant="secondary" onPress={load}>Refresh predictions</Button>
    </Screen>
  );
}

function BettingBalance({ balanceUnits, open, countdown, lockMinutes }: { balanceUnits: number; open: boolean; countdown: string; lockMinutes: number }) { return <Card style={styles.balanceCard}><View style={styles.coin}><Text style={styles.coinText}>TL</Text></View><View style={styles.balanceCopy}><Text style={styles.balanceLabel}>YOUR BALANCE</Text><Text style={styles.balance}>{formatCoins(balanceUnits)}</Text></View><View style={styles.lockCopy}><Text style={styles.lockText}>{open ? `Closes in ${countdown}` : 'Betting closed'}</Text><Text style={[styles.openStatus, !open && styles.closed]}>{lockMinutes} MIN BEFORE KICKOFF · {open ? 'BETS OPEN' : 'BETS CLOSED'}</Text></View></Card>; }

function UnlockCard({ availability, onGames }: { availability: Availability; onGames: () => void }) { const remaining = Math.max(availability.required_games - availability.completed_games, 0); return <Card style={styles.unlock}><Icon name={{ ios: 'lock.fill', android: 'lock' }} color={colors.gold} size={27} /><Text style={styles.lockTitle}>PREDICTIONS UNLOCK AFTER 3 COMPLETED GAMES.</Text><Text style={styles.progress}>{availability.completed_games}/{availability.required_games}</Text><Text style={styles.muted}>{remaining} game{remaining === 1 ? '' : 's'} left to unlock predictions.</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, availability.required_games ? availability.completed_games / availability.required_games * 100 : 100)}%` }]} /></View><View style={styles.full}><Button variant="secondary" onPress={onGames}>View games</Button></View></Card>; }

function MyBets({ slips }: { slips: BetSlip[] }) { return <Card style={styles.listCard}><Text style={styles.listTitle}>MY BETS ONLY</Text>{slips.length ? slips.map(slip => <View key={slip.id} style={styles.betRow}><View style={styles.betCopy}><Text style={styles.betTitle}>{slip.slip_type === 'builder' ? 'Same-game builder' : 'Single prediction'}</Text><Text style={styles.muted}>{formatMatchTime(slip.placed_at)} · {formatCoins(slip.stake_units)} coin stake</Text></View><View><Text style={[styles.betStatus, slip.status === 'won' && styles.won]}>{slip.status}</Text><Text style={styles.betOdds}>{Number(slip.accepted_odds).toFixed(2)}</Text></View></View>) : <Text style={styles.muted}>You have not placed any predictions in this league.</Text>}</Card>; }

function BettingStandings({ standings, userId }: { standings: Standing[]; userId?: string }) { return <Card style={styles.listCard}><Text style={styles.listTitle}>PREDICTION TABLE</Text>{standings.length ? standings.map((row, index) => <View key={row.user_id} style={[styles.boardRow, row.user_id === userId && styles.boardMe]}><Text style={styles.rank}>#{index + 1}</Text><View style={styles.boardCopy}><Text style={styles.boardName}>{row.username}{row.user_id === userId ? ' · YOU' : ''}</Text><Text style={styles.muted}>{row.won_bets}/{row.settled_bets} won</Text></View><Text style={styles.points}>{formatCoins(row.balance_units)}</Text></View>) : <Text style={styles.muted}>Standings appear after league members place predictions.</Text>}</Card>; }

function builderOdds(values: number[], margin: number) { if (!values.length) return 1; const product = values.reduce((total, value) => total * value, 1); return values.length === 1 ? product : Math.max(1.01, 1 + (product - 1) * (1 - margin)); }
function formatCoins(units: number) { return (units / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function formatCountdown(ms: number) { const days = Math.floor(ms / 86_400_000); const hours = Math.floor((ms % 86_400_000) / 3_600_000); const minutes = Math.floor((ms % 3_600_000) / 60_000); const seconds = Math.floor((ms % 60_000) / 1_000); return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`; }
function fixtureDate(value: string) { const date = new Date(value); const base = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`; return date.getFullYear() === new Date().getFullYear() ? base : `${base}/${date.getFullYear()}`; }
function fixtureTime(value: string) { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)); }

const styles = StyleSheet.create({
  bottom: { position: 'relative' }, intro: { gap: spacing.xs }, playSwitch: { flexDirection: 'row', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, padding: 4, backgroundColor: colors.ink850 }, playTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm }, playTabActive: { backgroundColor: colors.goldSoft }, playTabText: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 12 }, playTabActiveText: { color: colors.gold, fontFamily: fonts.sansExtraBold, fontSize: 12 },
  tabs: { flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, padding: 4 }, tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm }, tabActive: { backgroundColor: colors.goldSoft }, tabText: { color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 10 }, tabTextActive: { color: colors.gold, fontFamily: fonts.sansExtraBold }, muted: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  unlock: { alignItems: 'center', paddingVertical: spacing.xl }, lockTitle: { maxWidth: 320, color: colors.chalk, fontFamily: fonts.display, fontSize: 23, textAlign: 'center' }, progress: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 34 }, progressTrack: { alignSelf: 'stretch', height: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: colors.ink800 }, progressFill: { height: '100%', backgroundColor: colors.gold }, full: { alignSelf: 'stretch' },
  balanceCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 10 }, coin: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.gold, borderRadius: 22, backgroundColor: colors.goldSoft }, coinText: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 10 }, balanceCopy: { flex: 1 }, balanceLabel: { color: '#B18A37', fontFamily: fonts.sansBlack, fontSize: 7, letterSpacing: 1.3 }, balance: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 22 }, lockCopy: { alignItems: 'flex-end', maxWidth: '46%' }, lockText: { color: colors.chalk72, fontFamily: fonts.sansSemiBold, fontSize: 9, textAlign: 'right' }, openStatus: { marginTop: 4, color: colors.turf400, fontFamily: fonts.sansBlack, fontSize: 6, letterSpacing: 0.7, textAlign: 'right' }, closed: { color: colors.danger },
  gameChoices: { flexDirection: 'row', gap: spacing.sm }, gameChoice: { flex: 1, minHeight: 58, justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 11 }, gameChoiceActive: { borderColor: 'rgba(218,165,32,0.55)', backgroundColor: 'rgba(218,165,32,0.11)' }, gameChoiceDate: { color: colors.chalkMuted, fontFamily: fonts.monoBold, fontSize: 12 }, gameChoiceDateActive: { color: colors.gold }, gameChoiceTime: { marginTop: 3, color: colors.chalkMuted, fontFamily: fonts.sansSemiBold, fontSize: 8 }, gameHead: { gap: 3, padding: spacing.md }, gameTitle: { color: colors.chalk, fontFamily: fonts.display, fontSize: 23 },
  listCard: { padding: spacing.md, gap: 0 }, listTitle: { marginBottom: spacing.sm, color: colors.chalk, fontFamily: fonts.display, fontSize: 23 }, betRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder }, betCopy: { flex: 1 }, betTitle: { color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, betStatus: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 8, textTransform: 'uppercase', textAlign: 'right' }, won: { color: colors.turf400 }, betOdds: { marginTop: 3, color: colors.chalk, fontFamily: fonts.monoBold, fontSize: 12, textAlign: 'right' }, boardRow: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder }, boardMe: { backgroundColor: colors.goldSoft }, rank: { width: 35, color: colors.gold, fontFamily: fonts.monoBold, fontSize: 10 }, boardCopy: { flex: 1 }, boardName: { color: colors.chalk, fontFamily: fonts.sansBold, fontSize: 12 }, points: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 13 },
});
