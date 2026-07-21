"use client";

import { useEffect, useState } from "react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useBettingData } from "@/hooks/useBettingData";
import { bettingSelectionGroup, coinsFromUnits, quoteBuilderOdds } from "@/lib/betting";
import { supabase } from "@/lib/supabase";
import { BettingOutcome, Game, LeagueData } from "@/lib/types";
import { BetSlipCard, BettingBalance, bettingCategoryOrder, MarketSection } from "./BettingMarketComponents";
import { EmptyState, ErrorState, LoadingState, Toast } from "./ui";

export function GameBettingPanel({ game, data }: { game: Game; data: LeagueData }) {
  const betting = useBettingData();
  const { user } = useAuthProfile();
  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState<string[]>([]);
  const [stake, setStake] = useState("");
  const [placing, setPlacing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!game.season_id || !user) return;
    void supabase.rpc("ensure_betting_wallet", { target_season_id: game.season_id }).then(() => betting.reload());
    // Wallet creation is idempotent and only needs to rerun when this game/season changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, game.season_id, user?.id]);

  if (betting.loading) return <LoadingState label="Loading game bets" cards={3} />;
  if (betting.error) return <ErrorState message={betting.error} onRetry={betting.reload} />;

  const settings = betting.data.settings;
  const markets = betting.data.markets.filter(market => market.game_id === game.id && market.status !== "draft");
  const outcomes = betting.data.outcomes.filter(outcome => markets.some(market => market.id === outcome.market_id));
  const selectedOutcomes = selectedOutcomeIds.map(id => outcomes.find(outcome => outcome.id === id)).filter(Boolean) as BettingOutcome[];
  const combinedOdds = quoteBuilderOdds(selectedOutcomes.map(outcome => Number(outcome.offered_odds)), Number(settings?.builder_margin ?? 0.1));
  const stakeCoins = Number(stake || 0);
  const potentialReturn = stakeCoins > 0 ? stakeCoins * combinedOdds : 0;
  const wallet = betting.data.wallets.find(item => item.user_id === user?.id && item.season_id === game.season_id);
  const balanceUnits = wallet?.balance_units ?? Number(settings?.starting_balance_units ?? 10000);
  const lockAt = new Date(new Date(game.game_date).getTime() - Number(settings?.lock_minutes ?? 5) * 60_000);
  const isOpen = (game.status === "upcoming" || game.status === "draft") && now < lockAt.getTime() && markets.some(market => market.status === "open");

  function toggleOutcome(outcome: BettingOutcome) {
    if (!isOpen) return;
    setSelectedOutcomeIds(current => {
      if (current.includes(outcome.id)) return current.filter(id => id !== outcome.id);
      const targetGroup = bettingSelectionGroup(marketForOutcome(outcome, markets)!);
      const withoutSameGroup = current.filter(id => {
        const existingOutcome = outcomes.find(item => item.id === id);
        const existingMarket = existingOutcome ? marketForOutcome(existingOutcome, markets) : undefined;
        return !existingMarket || bettingSelectionGroup(existingMarket) !== targetGroup;
      });
      if (withoutSameGroup.length >= 5) {
        setToast("A same-game builder can contain up to five selections.");
        return current;
      }
      return [...withoutSameGroup, outcome.id];
    });
  }

  async function placeBet() {
    if (!selectedOutcomeIds.length || placing) return;
    if (!Number.isFinite(stakeCoins) || stakeCoins <= 0 || Math.round(stakeCoins * 100) !== stakeCoins * 100) return setToast("Enter a positive stake with up to two decimals.");
    if (stakeCoins > coinsFromUnits(balanceUnits)) return setToast("You do not have enough coins for that stake.");
    setPlacing(true);
    const { error } = await supabase.rpc("place_bet", {
      target_game_id: game.id,
      selected_outcome_ids: selectedOutcomeIds,
      stake_coins: stakeCoins,
      client_request_id: crypto.randomUUID()
    });
    setPlacing(false);
    if (error) return setToast(error.message);
    setToast(`${selectedOutcomeIds.length === 1 ? "Bet" : "Bet builder"} placed at ${combinedOdds.toFixed(2)} odds.`);
    setSelectedOutcomeIds([]);
    setStake("");
    await betting.reload();
  }

  return (
    <div className="space-y-5">
      <Toast message={toast} onDone={() => setToast(null)} />
      <BettingBalance balanceUnits={balanceUnits} lockAt={lockAt} isOpen={isOpen} compact />

      {!markets.length ? <EmptyState title="No bets available" text="Markets will appear here as soon as the confirmed lineups have been priced and approved by the admin." /> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            {bettingCategoryOrder.map(category => {
              const categoryMarkets = markets.filter(market => market.market_type === category.type);
              if (!categoryMarkets.length) return null;
              return <MarketSection key={category.type} label={category.label} markets={categoryMarkets} outcomes={outcomes} lineups={data.lineups.filter(lineup => lineup.game_id === game.id)} selected={selectedOutcomeIds} disabled={!isOpen} onToggle={toggleOutcome} />;
            })}
          </div>
          <BetSlipCard markets={markets} outcomes={selectedOutcomes} odds={combinedOdds} stake={stake} potentialReturn={potentialReturn} balanceUnits={balanceUnits} disabled={!isOpen} placing={placing} onStake={setStake} onRemove={id => setSelectedOutcomeIds(current => current.filter(item => item !== id))} onPlace={placeBet} />
        </div>
      )}
    </div>
  );
}

function marketForOutcome(outcome: BettingOutcome, markets: import("@/lib/types").BettingMarket[]) {
  return markets.find(market => market.id === outcome.market_id);
}
