import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import { MarketSections } from '@/components/BettingMarkets';
import { LeagueCoin } from '@/components/LeagueCoin';
import { Card, EmptyState, Icon, Message } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import type { BettingMarket, BettingOutcome, BettingWallet, Game, GameLineup } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Settings = { starting_balance_units: number; lock_minutes: number; builder_margin: number; max_builder_selections: number };
type Availability = { unlocked: boolean; completed_games: number; required_games: number };

export function GameBettingPanel({ game, leagueId, lineups }: { game: Game; leagueId: string; lineups: GameLineup[] }) {
  const { user } = useAuth();
  const [markets, setMarkets] = useState<BettingMarket[]>([]);
  const [outcomes, setOutcomes] = useState<BettingOutcome[]>([]);
  const [wallet, setWallet] = useState<BettingWallet | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [stake, setStake] = useState('');
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    if (game.season_id) await supabase.rpc('ensure_betting_wallet', { target_season_id: game.season_id });
    const responses = await Promise.all([
      supabase.rpc('league_betting_availability', { target_league_id: leagueId }),
      supabase.rpc('get_league_betting_public_settings', { target_league_id: leagueId }).maybeSingle(),
      supabase.from('betting_markets').select('*').eq('league_id', leagueId).eq('game_id', game.id).neq('status', 'draft').order('created_at'),
      supabase.from('betting_outcomes').select('*').eq('league_id', leagueId).order('created_at'),
      supabase.from('betting_wallets').select('*').eq('league_id', leagueId).eq('user_id', user.id).eq('season_id', game.season_id || '').maybeSingle(),
    ]);
    setLoading(false);
    const failure = responses.find(item => item.error)?.error;
    if (failure) return setMessage({ text: friendlyMobileError(failure, 'Match predictions could not be loaded.'), tone: 'error' });
    const availabilityRow = Array.isArray(responses[0].data) ? responses[0].data[0] : responses[0].data;
    const nextMarkets = ((responses[2].data || []) as BettingMarket[]).filter(item => !item.invalidated);
    setAvailability((availabilityRow || null) as Availability | null);
    setSettings((responses[1].data || null) as Settings | null);
    setMarkets(nextMarkets);
    setOutcomes(((responses[3].data || []) as BettingOutcome[]).filter(outcome => nextMarkets.some(market => market.id === outcome.market_id)));
    setWallet((responses[4].data || null) as BettingWallet | null);
  }, [game.id, game.season_id, leagueId, user]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);

  const selectedOutcomes = selected.map(id => outcomes.find(row => row.id === id)).filter((row): row is BettingOutcome => !!row);
  const odds = useMemo(() => builderOdds(selectedOutcomes.map(row => Number(row.offered_odds)), Number(settings?.builder_margin ?? 0.1)), [selectedOutcomes, settings?.builder_margin]);
  const balanceUnits = Number(wallet?.balance_units ?? settings?.starting_balance_units ?? 10000);
  const balance = balanceUnits / 100;
  const stakeCoins = Number(stake || 0);
  const lockAt = new Date(game.game_date).getTime() - Number(settings?.lock_minutes ?? 5) * 60_000;
  const open = (game.status === 'upcoming' || game.status === 'draft') && now < lockAt && markets.some(market => market.status === 'open');

  function toggle(outcome: BettingOutcome) {
    if (!open) return;
    const market = markets.find(item => item.id === outcome.market_id);
    if (!market) return;
    setSelected(current => {
      if (current.includes(outcome.id)) return current.filter(id => id !== outcome.id);
      const group = selectionGroup(market);
      const compatible = current.filter(id => {
        const existingOutcome = outcomes.find(item => item.id === id);
        const existingMarket = markets.find(item => item.id === existingOutcome?.market_id);
        return existingMarket && selectionGroup(existingMarket) !== group;
      });
      if (compatible.length >= Number(settings?.max_builder_selections ?? 5)) {
        setMessage({ text: `Choose up to ${settings?.max_builder_selections ?? 5} compatible outcomes.`, tone: 'error' });
        return current;
      }
      return [...compatible, outcome.id];
    });
  }

  async function place() {
    if (!selected.length || placing) return;
    if (!Number.isFinite(stakeCoins) || stakeCoins <= 0 || Math.round(stakeCoins * 100) !== stakeCoins * 100) return setMessage({ text: 'Enter a positive stake with up to two decimals.', tone: 'error' });
    if (stakeCoins > balance) return setMessage({ text: 'You do not have enough league coins for that stake.', tone: 'error' });
    setPlacing(true);
    setMessage(null);
    const result = await getSupabaseClient().rpc('place_league_bet', { target_game_id: game.id, selected_outcome_ids: selected, stake_coins: stakeCoins, client_request_id: Crypto.randomUUID() });
    setPlacing(false);
    if (result.error) return setMessage({ text: friendlyMobileError(result.error, 'Your prediction could not be placed.'), tone: 'error' });
    setMessage({ text: `${selected.length === 1 ? 'Prediction' : 'Builder'} placed at ${odds.toFixed(2)} odds.`, tone: 'success' });
    setSelected([]);
    setStake('');
    await load();
  }

  if (loading) return <Card style={styles.center}><Text style={styles.muted}>Loading match predictions...</Text></Card>;
  if (availability && !availability.unlocked) return <Card style={styles.center}><Icon name={{ ios: 'lock.fill', android: 'lock' }} color={colors.gold} size={27} /><Text style={styles.title}>PREDICTIONS UNLOCK AFTER 3 COMPLETED GAMES.</Text><Text style={styles.progress}>{availability.completed_games}/{availability.required_games}</Text><Text style={styles.muted}>{Math.max(availability.required_games - availability.completed_games, 0)} games left to unlock predictions.</Text></Card>;

  return <View style={styles.wrap}>
    {message ? <Message tone={message.tone}>{message.text}</Message> : null}
    <Card style={styles.balanceCard}><LeagueCoin size={43} /><View style={styles.balanceCopy}><Text style={styles.label}>YOUR BALANCE</Text><Text style={styles.balance}>{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text></View><View style={styles.lockCopy}><Text style={styles.lock}>{open ? 'Predictions open' : 'Predictions closed'}</Text><Text style={[styles.state, open && styles.stateOpen]}>{settings?.lock_minutes ?? 5} MIN BEFORE KICKOFF</Text></View></Card>
    {markets.length ? <MarketSections markets={markets} outcomes={outcomes} lineups={lineups} selected={selected} disabled={!open} onToggle={toggle} /> : <EmptyState title="No markets available" text="Markets appear automatically after valid lineups are saved." />}
    {selectedOutcomes.length ? <Card style={styles.slip}><View style={styles.slipHead}><View><Text style={styles.slipTitle}>{selectedOutcomes.length > 1 ? 'BET BUILDER' : 'SINGLE PREDICTION'}</Text><Text style={styles.muted}>{selectedOutcomes.length} selection{selectedOutcomes.length === 1 ? '' : 's'}</Text></View><Text style={styles.odds}>{odds.toFixed(2)}</Text></View>{selectedOutcomes.map(outcome => <View key={outcome.id} style={styles.selection}><View style={styles.selectionCopy}><Text numberOfLines={1} style={styles.selectionMarket}>{markets.find(market => market.id === outcome.market_id)?.title}</Text><Text numberOfLines={1} style={styles.selectionName}>{outcome.label} · {Number(outcome.offered_odds).toFixed(2)}</Text></View><Pressable accessibilityLabel={`Remove ${outcome.label}`} onPress={() => setSelected(rows => rows.filter(id => id !== outcome.id))} style={styles.remove}><Text style={styles.removeText}>×</Text></Pressable></View>)}<View style={styles.stakeRow}><TextInput value={stake} onChangeText={setStake} keyboardType="decimal-pad" placeholder="Stake in coins" placeholderTextColor={colors.chalk45} style={styles.input} /><Pressable disabled={!open || placing || stakeCoins <= 0} onPress={place} style={[styles.place, (!open || placing || stakeCoins <= 0) && styles.disabled]}><Text style={styles.placeText}>{placing ? 'Placing...' : 'Place'}</Text></Pressable></View><View style={styles.quick}>{[5, 10, 25].map(amount => <Pressable key={amount} onPress={() => setStake(String(Math.min(balance, stakeCoins + amount)))} style={styles.quickButton}><Text style={styles.quickText}>+{amount}</Text></Pressable>)}<Pressable onPress={() => setStake(String(balance))} style={styles.quickButton}><Text style={styles.quickText}>Max</Text></Pressable></View><View style={styles.returnRow}><Text style={styles.muted}>Balance {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text><Text style={styles.return}>Potential {(stakeCoins * odds).toFixed(2)}</Text></View></Card> : null}
  </View>;
}

function selectionGroup(market: BettingMarket) { return `${market.market_type}:${market.subject_player_id || market.subject_team || 'game'}`; }
function builderOdds(values: number[], margin: number) { if (!values.length) return 1; const product = values.reduce((total, value) => total * value, 1); return values.length === 1 ? product : Math.max(1.01, 1 + (product - 1) * (1 - margin)); }

const styles = StyleSheet.create({ wrap: { gap: spacing.md }, center: { alignItems: 'center', paddingVertical: spacing.xl }, title: { maxWidth: 320, color: colors.chalk, fontFamily: fonts.display, fontSize: 23, textAlign: 'center' }, progress: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 34 }, muted: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 }, balanceCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 10 }, balanceCopy: { flex: 1 }, label: { color: '#B18A37', fontFamily: fonts.sansBlack, fontSize: 7, letterSpacing: 1.3 }, balance: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 22 }, lockCopy: { alignItems: 'flex-end' }, lock: { color: colors.chalk72, fontFamily: fonts.sansSemiBold, fontSize: 9 }, state: { marginTop: 3, color: colors.danger, fontFamily: fonts.sansBlack, fontSize: 6, letterSpacing: 0.7 }, stateOpen: { color: colors.turf400 }, slip: { borderColor: colors.goldBorderStrong, padding: spacing.md }, slipHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, slipTitle: { color: colors.chalk, fontFamily: fonts.display, fontSize: 21 }, odds: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 21 }, selection: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.goldBorder }, selectionCopy: { flex: 1 }, selectionMarket: { color: colors.chalk45, fontFamily: fonts.sans, fontSize: 8 }, selectionName: { color: colors.chalk, fontFamily: fonts.sansSemiBold, fontSize: 11 }, remove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, removeText: { color: colors.chalkMuted, fontSize: 22 }, stakeRow: { flexDirection: 'row', gap: spacing.sm }, input: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, color: colors.chalk, fontFamily: fonts.sansMedium, fontSize: 12, paddingHorizontal: 12 }, place: { minWidth: 96, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.gold }, placeText: { color: colors.goldInk, fontFamily: fonts.sansExtraBold, fontSize: 11 }, disabled: { opacity: 0.4 }, quick: { flexDirection: 'row', gap: 5 }, quickButton: { flex: 1, minHeight: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 8, backgroundColor: colors.goldSoft }, quickText: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 9 }, returnRow: { flexDirection: 'row', justifyContent: 'space-between' }, return: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 10 } });
