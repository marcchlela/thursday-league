"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Check, EyeOff, ShieldCheck, X } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useBettingData } from "@/hooks/useBettingData";
import { useBettingSocial } from "@/hooks/useBettingSocial";
import { useLeagueData } from "@/hooks/useLeagueData";
import { bettingSelectionGroup, coinsFromUnits, quoteBuilderOdds } from "@/lib/betting";
import { supabase } from "@/lib/supabase";
import { BetSlip, BettingMarket, BettingOutcome, Game, PublicBetSlip } from "@/lib/types";
import { cn, currentSeason, formatDateTime } from "@/lib/utils";
import { BetSlipCard, BettingBalance, bettingCategoryOrder, MarketSection } from "@/components/BettingMarketComponents";
import { CoinAmount, LeagueCoin } from "@/components/LeagueCoin";
import { PlaySwitcher } from "@/components/PlaySwitcher";
import { Card, EmptyState, ErrorState, LoadingState, Pill, Select, TabList, Toast } from "@/components/ui";

type PageTab = "markets" | "mine" | "league";

export default function BettingPage() {
  const league = useLeagueData();
  const betting = useBettingData();
  const { user } = useAuthProfile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: PageTab = requestedTab === "mine" || requestedTab === "league" ? requestedTab : "markets";
  const [gameId, setGameId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState<string[]>([]);
  const [stake, setStake] = useState("");
  const [placing, setPlacing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const availableGames = useMemo(() => {
    const gameIds = new Set(betting.data.markets.filter(market => market.status !== "draft").map(market => market.game_id));
    return league.data.games
      .filter(game => gameIds.has(game.id))
      .sort((first, second) => new Date(second.game_date).getTime() - new Date(first.game_date).getTime());
  }, [betting.data.markets, league.data.games]);

  useEffect(() => {
    if (gameId && availableGames.some(game => game.id === gameId)) return;
    const preferred = availableGames.find(game => game.status === "upcoming" || game.status === "draft") || availableGames[0];
    setGameId(preferred?.id || "");
  }, [availableGames, gameId]);

  useEffect(() => {
    if (seasonId && league.data.seasons.some(season => season.id === seasonId)) return;
    setSeasonId(currentSeason(league.data)?.id || league.data.seasons[0]?.id || "");
  }, [league.data, seasonId]);

  const game = league.data.games.find(item => item.id === gameId);
  const social = useBettingSocial(gameId, seasonId, tab === "league");

  useEffect(() => {
    if (!game?.season_id || !user) return;
    void supabase.rpc("ensure_betting_wallet", { target_season_id: game.season_id }).then(() => betting.reload());
    // The wallet RPC is idempotent; rerun only when the selected season changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.season_id, user?.id]);

  useEffect(() => { setSelectedOutcomeIds([]); setStake(""); }, [gameId]);

  if (league.loading || betting.loading) return <LoadingState label="Loading betting markets" cards={4} />;
  if (league.error) return <ErrorState message={league.error} onRetry={league.reload} />;
  if (betting.error) return <ErrorState message={`${betting.error} Run the virtual betting migration in Supabase if it has not been applied yet.`} onRetry={betting.reload} />;

  const settings = betting.data.settings;
  const markets = betting.data.markets.filter(market => market.game_id === gameId && market.status !== "draft");
  const outcomes = betting.data.outcomes.filter(outcome => markets.some(market => market.id === outcome.market_id));
  const selectedOutcomes = selectedOutcomeIds.map(id => outcomes.find(outcome => outcome.id === id)).filter(Boolean) as BettingOutcome[];
  const builderOdds = quoteBuilderOdds(selectedOutcomes.map(outcome => Number(outcome.offered_odds)), Number(settings?.builder_margin ?? 0.1));
  const stakeCoins = Number(stake || 0);
  const potentialReturn = stakeCoins > 0 ? stakeCoins * builderOdds : 0;
  const wallet = betting.data.wallets.find(item => item.user_id === user?.id && item.season_id === game?.season_id);
  const balanceUnits = wallet?.balance_units ?? Number(settings?.starting_balance_units ?? 10000);
  const lockAt = game ? new Date(new Date(game.game_date).getTime() - Number(settings?.lock_minutes ?? 5) * 60_000) : null;
  const isOpen = !!game && (game.status === "upcoming" || game.status === "draft") && !!lockAt && now < lockAt.getTime() && markets.some(market => market.status === "open");
  const lineups = league.data.lineups.filter(lineup => lineup.game_id === gameId);

  function setTab(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleOutcome(outcome: BettingOutcome) {
    const selectedMarket = markets.find(market => market.id === outcome.market_id);
    if (!selectedMarket || !isOpen) return;
    const selectedGroup = bettingSelectionGroup(selectedMarket);
    setSelectedOutcomeIds(current => {
      if (current.includes(outcome.id)) return current.filter(id => id !== outcome.id);
      const withoutSameGroup = current.filter(id => {
        const existingOutcome = outcomes.find(item => item.id === id);
        const existingMarket = markets.find(item => item.id === existingOutcome?.market_id);
        return !existingMarket || bettingSelectionGroup(existingMarket) !== selectedGroup;
      });
      if (withoutSameGroup.length >= 5) {
        setToast("A same-game builder can contain up to five selections.");
        return current;
      }
      return [...withoutSameGroup, outcome.id];
    });
  }

  async function placeBet() {
    if (!game || !selectedOutcomeIds.length) return;
    if (!Number.isFinite(stakeCoins) || stakeCoins <= 0 || Math.round(stakeCoins * 100) !== stakeCoins * 100) return setToast("Enter a positive stake with up to two decimals.");
    if (!wallet || stakeCoins > coinsFromUnits(wallet.balance_units)) return setToast("You do not have enough coins for that stake.");
    setPlacing(true);
    const { error } = await supabase.rpc("place_bet", {
      target_game_id: game.id,
      selected_outcome_ids: selectedOutcomeIds,
      stake_coins: stakeCoins,
      client_request_id: crypto.randomUUID()
    });
    setPlacing(false);
    if (error) return setToast(error.message);
    setToast(`${selectedOutcomeIds.length === 1 ? "Bet" : "Bet builder"} placed at ${builderOdds.toFixed(2)} odds.`);
    setSelectedOutcomeIds([]);
    setStake("");
    await betting.reload();
  }

  return (
    <div className="space-y-6">
      <Toast message={toast} onDone={() => setToast(null)} />
      <PlaySwitcher active="bets" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-floodlight"><LeagueCoin size={23} /><span className="text-xs font-bold uppercase tracking-[.2em]">Virtual coins only</span></div>
          <h1 className="mt-2 font-display text-5xl uppercase">Bets</h1>
          <p className="mt-2 max-w-2xl text-sm text-chalk/60">Make predictions, compare picks after lock, and climb the league table. Coins have no cash value.</p>
        </div>
        <BettingBalance balanceUnits={balanceUnits} compact />
      </header>

      <div className="rounded-3xl border border-perimeter-400/25 bg-perimeter-400/10 p-4 text-sm text-chalk/75">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-perimeter-400" size={20} /><p><strong className="text-chalk">Fair-play design:</strong> probabilities come from the ten selected players and historical 5v5 performance, not permanent team names. Other players&apos; selections stay hidden until betting locks.</p></div>
      </div>

      <TabList idPrefix="betting" label="Betting sections" tabs={[{ id: "markets", label: "Markets" }, { id: "mine", label: "My bets" }, { id: "league", label: "League" }]} active={tab} onChange={setTab} />

      {tab === "markets" ? (
        <div id="betting-markets-panel" role="tabpanel" aria-labelledby="betting-markets-tab" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <GamePicker gameId={gameId} games={availableGames} lockAt={lockAt} isOpen={isOpen} onGame={setGameId} />
            {!availableGames.length ? <EmptyState title="No betting markets yet" text="Markets appear here after the lineups are confirmed and an admin approves the generated probabilities and odds." /> : null}
            {bettingCategoryOrder.map(category => {
              const categoryMarkets = markets.filter(market => market.market_type === category.type);
              if (!categoryMarkets.length) return null;
              return <MarketSection key={category.type} label={category.label} markets={categoryMarkets} outcomes={outcomes} lineups={lineups} selected={selectedOutcomeIds} disabled={!isOpen} onToggle={toggleOutcome} />;
            })}
          </div>
          <BetSlipCard markets={markets} outcomes={selectedOutcomes} odds={builderOdds} stake={stake} potentialReturn={potentialReturn} balanceUnits={balanceUnits} disabled={!isOpen} placing={placing} onStake={setStake} onRemove={id => setSelectedOutcomeIds(current => current.filter(item => item !== id))} onPlace={placeBet} />
        </div>
      ) : null}

      {tab === "mine" ? <div id="betting-mine-panel" role="tabpanel" aria-labelledby="betting-mine-tab"><BetHistory slips={betting.data.slips.filter(slip => slip.user_id === user?.id)} games={league.data.games} markets={betting.data.markets} outcomes={betting.data.outcomes} allLegs={betting.data.legs} /></div> : null}

      {tab === "league" ? <div id="betting-league-panel" role="tabpanel" aria-labelledby="betting-league-tab"><LeagueBets userId={user?.id} gameId={gameId} seasonId={seasonId} games={availableGames} seasons={league.data.seasons} standings={social.standings} slips={social.slips} loading={social.loading} error={social.error} onGame={setGameId} onSeason={setSeasonId} onRetry={social.reload} /></div> : null}
    </div>
  );
}

function GamePicker({ gameId, games, lockAt, isOpen, onGame }: { gameId: string; games: Game[]; lockAt: Date | null; isOpen: boolean; onGame: (id: string) => void }) {
  return <Card><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label className="block flex-1"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-chalk/50">Game</span><Select value={gameId} onChange={event => onGame(event.target.value)}>{games.map(game => <option key={game.id} value={game.id}>{formatDateTime(game.game_date)}</option>)}</Select></label>{gameId ? <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm"><div className="flex items-center gap-2 font-semibold"><CalendarClock size={16} className="text-floodlight" /> Locks {lockAt?.toLocaleString()}</div><div className={cn("mt-1 text-xs font-bold uppercase tracking-wider", isOpen ? "text-turf-400" : "text-red-300")}>{isOpen ? "Open" : "Betting closed"}</div></div> : null}</div></Card>;
}

function BetHistory({ slips, games, markets, outcomes, allLegs }: { slips: BetSlip[]; games: Game[]; markets: BettingMarket[]; outcomes: BettingOutcome[]; allLegs: import("@/lib/types").BetLeg[] }) {
  if (!slips.length) return <EmptyState title="No bets yet" text="Your open and settled slips will appear here." />;
  return <div className="space-y-3">{slips.map(slip => {
    const game = games.find(item => item.id === slip.game_id);
    const legs = allLegs.filter(leg => leg.slip_id === slip.id);
    const statusTone = slip.status === "won" ? "text-turf-400 border-turf-400/30 bg-turf-400/10" : slip.status === "lost" ? "text-red-300 border-red-400/30 bg-red-400/10" : slip.status === "void" ? "text-chalk/60 border-white/15 bg-white/5" : "text-floodlight border-floodlight/30 bg-floodlight/10";
    return <Card key={slip.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Pill>{slip.slip_type}</Pill><span className="text-xs text-chalk/45">{new Date(slip.placed_at).toLocaleString()}</span></div><h2 className="mt-2 font-display text-2xl uppercase">{game ? formatDateTime(game.game_date) : "Game"}</h2></div><span className={cn("rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider", statusTone)}>{slip.status}</span></div><div className="mt-4 space-y-2">{legs.map(leg => { const market = markets.find(item => item.id === leg.market_id); const outcome = outcomes.find(item => item.id === leg.outcome_id); return <div key={leg.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm"><span>{market?.title}: <strong>{outcome?.label}</strong></span><span className="flex items-center gap-2 font-mono">{Number(leg.accepted_odds).toFixed(2)} {leg.status === "won" ? <Check size={15} className="text-turf-400" /> : leg.status === "lost" ? <X size={15} className="text-red-300" /> : null}</span></div>; })}</div><SlipNumbers stake={slip.stake_units} odds={Number(slip.accepted_odds)} payout={slip.status === "pending" ? slip.potential_payout_units : (slip.settled_payout_units || 0)} payoutLabel={slip.status === "pending" ? "Potential" : "Paid"} /></Card>;
  })}</div>;
}

function LeagueBets({ userId, gameId, seasonId, games, seasons, standings, slips, loading, error, onGame, onSeason, onRetry }: { userId?: string; gameId: string; seasonId: string; games: Game[]; seasons: import("@/lib/types").Season[]; standings: import("@/lib/types").BettingStanding[]; slips: PublicBetSlip[]; loading: boolean; error: string | null; onGame: (id: string) => void; onSeason: (id: string) => void; onRetry: () => void | Promise<void> }) {
  if (loading) return <LoadingState label="Loading league bets" cards={3} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return (
    <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
      <Card>
        <h2 className="font-display text-3xl uppercase">Bet standings</h2>
        <p className="mt-1 text-sm text-chalk/50">Ranked by profit from settled bets. Pending stakes do not change the profit ranking.</p>
        <Select value={seasonId} onChange={event => onSeason(event.target.value)} className="mt-4" aria-label="Betting standings season">{seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</Select>
        <div className="mt-4 space-y-2">{standings.map((row, index) => <div key={row.user_id} className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3", row.user_id === userId ? "border-floodlight/40 bg-floodlight/10" : "border-white/10 bg-white/[0.03]")}><span className="grid h-9 w-9 place-items-center rounded-xl bg-perimeter-400/15 font-mono text-perimeter-400">#{index + 1}</span><div><div className="font-semibold">{row.username}{row.user_id === userId ? " · you" : ""}</div><div className="text-xs text-chalk/45">{row.won_bets}/{row.settled_bets} won · {row.total_bets} total</div></div><div className="text-right"><CoinAmount units={row.settled_profit_units} iconSize={16} className={cn("font-semibold", row.settled_profit_units >= 0 ? "text-turf-400" : "text-red-300")} /><div className="mt-1 text-[10px] uppercase text-chalk/40">profit</div></div></div>)}</div>
      </Card>
      <Card>
        <h2 className="font-display text-3xl uppercase">League picks</h2>
        <p className="mt-1 text-sm text-chalk/50">Your picks are always visible to you. Everyone else&apos;s selections appear after the betting lock.</p>
        <Select value={gameId} onChange={event => onGame(event.target.value)} className="mt-4" aria-label="League bet game">{games.map(game => <option key={game.id} value={game.id}>{formatDateTime(game.game_date)}</option>)}</Select>
        <div className="mt-4 space-y-3">
          {!slips.length ? <EmptyState title="No league bets" text="Nobody has placed a bet for this game yet." /> : slips.map(slip => <PublicSlip key={slip.slip_id} slip={slip} own={slip.user_id === userId} />)}
        </div>
      </Card>
    </div>
  );
}

function PublicSlip({ slip, own }: { slip: PublicBetSlip; own: boolean }) {
  return <section className={cn("rounded-2xl border p-3", own ? "border-floodlight/40 bg-floodlight/[.07]" : "border-white/10 bg-black/20")}><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{slip.username}{own ? " · you" : ""}</div><div className="mt-1 text-xs text-chalk/45">{new Date(slip.placed_at).toLocaleString()} · {slip.slip_type}</div></div><Pill>{slip.status}</Pill></div>{slip.picks_revealed ? <div className="mt-3 space-y-1.5">{slip.legs.map((leg, index) => <div key={`${slip.slip_id}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm"><span>{leg.market_title}: <strong>{leg.outcome_label}</strong></span><span className="font-mono text-floodlight">{Number(leg.accepted_odds).toFixed(2)}</span></div>)}</div> : <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-chalk/50"><EyeOff size={17} /> Picks reveal when betting locks.</div>}<SlipNumbers stake={slip.stake_units} odds={Number(slip.accepted_odds)} payout={slip.status === "pending" ? slip.potential_payout_units : (slip.settled_payout_units || 0)} payoutLabel={slip.status === "pending" ? "Potential" : "Paid"} /></section>;
}

function SlipNumbers({ stake, odds, payout, payoutLabel }: { stake: number; odds: number; payout: number; payoutLabel: string }) {
  return <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white/5 p-2"><div className="text-[10px] uppercase text-chalk/45">Stake</div><CoinAmount units={stake} iconSize={14} className="mt-1" /></div><div className="rounded-xl bg-white/5 p-2"><div className="text-[10px] uppercase text-chalk/45">Odds</div><div className="mt-1 font-mono">{odds.toFixed(2)}</div></div><div className="rounded-xl bg-white/5 p-2"><div className="text-[10px] uppercase text-chalk/45">{payoutLabel}</div><CoinAmount units={payout} iconSize={14} className="mt-1 text-floodlight" /></div></div>;
}
