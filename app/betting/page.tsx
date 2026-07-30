"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, ChevronRight, HandCoins, LockKeyhole, Search, ShieldCheck, X } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useBettingData } from "@/hooks/useBettingData";
import { useBettingSocial } from "@/hooks/useBettingSocial";
import { useLeagueData } from "@/hooks/useLeagueData";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import { bettingSelectionGroup, coinsFromUnits, formatCoins, quoteBuilderOdds } from "@/lib/betting";
import { calculateScore } from "@/lib/scoring";
import { supabase } from "@/lib/supabase";
import { BetSlip, BettingMarket, BettingOutcome, BettingStanding, Game, LeagueData, Profile } from "@/lib/types";
import { cn, currentSeason, formatDateTime } from "@/lib/utils";
import { BetSlipCard, BetSlipDrawer, BettingBalance, bettingCategoryOrder, MarketSection } from "@/components/BettingMarketComponents";
import { CoinAmount } from "@/components/LeagueCoin";
import { PlaySwitcher } from "@/components/PlaySwitcher";
import { TeamCrest } from "@/components/TeamCrest";
import { TiloMoment } from "@/components/TiloMoment";
import { AccountAvatar } from "@/components/AccountAvatar";
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, Select, TabList, TextInput, Toast, ToastTone } from "@/components/ui";

type PageTab = "markets" | "mine" | "standings";

export default function BettingPage() {
  const league = useLeagueData();
  const { league: activeLeague, leaguePath } = useLeagueContext();
  const betting = useBettingData();
  const { user } = useAuthProfile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedGameId = searchParams.get("game");
  const tab: PageTab = requestedTab === "mine" ? "mine" : requestedTab === "standings" || requestedTab === "league" ? "standings" : "markets";
  const [gameId, setGameId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [marketGameOpen, setMarketGameOpen] = useState(Boolean(requestedGameId));
  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState<string[]>([]);
  const [stake, setStake] = useState("");
  const [marketQuery, setMarketQuery] = useState("");
  const [placing, setPlacing] = useState(false);
  const [cashOutSlip, setCashOutSlip] = useState<BetSlip | null>(null);
  const [cashingOut, setCashingOut] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [toastLinksToMyBets, setToastLinksToMyBets] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [availability, setAvailability] = useState<{
    enabled: boolean;
    unlocked: boolean;
    completed_games: number;
    required_games: number;
  } | null>(null);

  useEffect(() => {
    if (!activeLeague) return;
    void supabase.rpc("league_betting_availability", {
      target_league_id: activeLeague.id
    }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setAvailability(row || null);
    });
  }, [activeLeague]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const availableGames = useMemo(() => {
    const gameIds = new Set(betting.data.markets.filter(market => market.status !== "draft").map(market => market.game_id));
    return league.data.games
      .filter(game => gameIds.has(game.id))
      .sort((first, second) => {
        const firstUpcoming = first.status === "upcoming" || first.status === "draft";
        const secondUpcoming = second.status === "upcoming" || second.status === "draft";
        if (firstUpcoming !== secondUpcoming) return firstUpcoming ? -1 : 1;
        const dateDifference = new Date(first.game_date).getTime() - new Date(second.game_date).getTime();
        return firstUpcoming ? dateDifference : -dateDifference;
      });
  }, [betting.data.markets, league.data.games]);

  useEffect(() => {
    if (gameId && availableGames.some(game => game.id === gameId)) return;
    if (requestedGameId && availableGames.some(game => game.id === requestedGameId)) {
      setGameId(requestedGameId);
      setMarketGameOpen(true);
      return;
    }
    const preferred = availableGames.find(game => game.status === "upcoming" || game.status === "draft") || availableGames[0];
    setGameId(preferred?.id || "");
  }, [availableGames, gameId, requestedGameId]);

  useEffect(() => {
    if (seasonId && league.data.seasons.some(season => season.id === seasonId)) return;
    setSeasonId(currentSeason(league.data)?.id || league.data.seasons[0]?.id || "");
  }, [league.data, seasonId]);

  const game = league.data.games.find(item => item.id === gameId);
  const social = useBettingSocial(seasonId, tab === "standings", game?.status);

  useEffect(() => {
    if (!game?.season_id || !user) return;
    void supabase.rpc("ensure_betting_wallet", { target_season_id: game.season_id }).then(() => betting.reload());
    // Wallet creation is idempotent and only needs to rerun when the selected season changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.season_id, user?.id]);

  useEffect(() => {
    setSelectedOutcomeIds([]);
    setStake("");
    setMarketQuery("");
  }, [gameId]);

  if (league.loading || betting.loading) return <LoadingState label="Loading betting markets" cards={4} />;
  if (league.error) return <ErrorState message={league.error} onRetry={league.reload} />;
  if (betting.error) return <ErrorState message={`${betting.error} Run the virtual betting migration in Supabase if it has not been applied yet.`} onRetry={betting.reload} />;
  if (!activeLeague?.betting_enabled) {
    return <EmptyState title="Betting is turned off" text="This league is using match tracking and Fantasy without virtual betting." />;
  }
  if (availability && !availability.unlocked) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <div className="rounded-[1.4rem] border border-league-gold/25 bg-ink-850 p-6 text-center shadow-[0_14px_34px_rgba(0,0,0,.18)]">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-league-gold/[.09] text-league-gold"><LockKeyhole size={22} /></span>
          <h1 className="mt-4 font-display text-4xl uppercase">Betting unlocks soon</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-chalk/48">
            This league needs {availability.required_games} completed game{availability.required_games === 1 ? "" : "s"} so the model has a useful baseline. {availability.completed_games} completed so far.
          </p>
          <div className="mx-auto mt-5 h-2 max-w-sm overflow-hidden rounded-full bg-chalk/[.06]">
            <div className="h-full rounded-full bg-league-gold" style={{ width: `${Math.min(100, availability.required_games ? availability.completed_games / availability.required_games * 100 : 100)}%` }} />
          </div>
          <button type="button" onClick={() => router.push(leaguePath("/games"))} className="mt-5 text-sm font-bold text-turf-400 hover:text-turf-100">View league games</button>
        </div>
      </div>
    );
  }

  const settings = betting.data.settings;
  const maxBuilderSelections = Number(settings?.max_builder_selections ?? 5);
  const markets = betting.data.markets.filter(market => market.game_id === gameId && market.status !== "draft");
  const outcomes = betting.data.outcomes.filter(outcome => markets.some(market => market.id === outcome.market_id));
  const selectedOutcomes = selectedOutcomeIds.map(id => outcomes.find(outcome => outcome.id === id)).filter(Boolean) as BettingOutcome[];
  const builderOdds = quoteBuilderOdds(selectedOutcomes.map(outcome => Number(outcome.offered_odds)), Number(settings?.builder_margin ?? 0.1));
  const stakeCoins = Number(stake || 0);
  const potentialReturn = stakeCoins > 0 ? stakeCoins * builderOdds : 0;
  const wallet = betting.data.wallets.find(item => item.user_id === user?.id && item.season_id === game?.season_id);
  const balanceUnits = wallet?.balance_units ?? Number(settings?.starting_balance_units ?? 10000);
  const lockMinutes = Number(settings?.lock_minutes ?? 5);
  const lockAt = game ? lockTime(game, lockMinutes) : null;
  const isOpen = !!game && bettingOpen(game, markets, lockMinutes, now);
  const lineups = league.data.lineups.filter(lineup => lineup.game_id === gameId);
  const hasBetForSelectedGame = betting.data.slips.some(slip => slip.user_id === user?.id && slip.game_id === gameId && slip.status !== "cashed_out");

  function setTab(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function showToast(message: string, tone: ToastTone = "info", linksToMyBets = false) {
    setToast({ message, tone });
    setToastLinksToMyBets(linksToMyBets);
  }

  function openGameMarkets(id: string) {
    setGameId(id);
    setMarketGameOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "markets");
    params.set("game", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeGameMarkets() {
    setMarketGameOpen(false);
    setSelectedOutcomeIds([]);
    setStake("");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "markets");
    params.delete("game");
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
      if (withoutSameGroup.length >= maxBuilderSelections) {
        showToast(`A same-game builder can contain up to ${maxBuilderSelections} selections.`, "warning");
        return current;
      }
      return [...withoutSameGroup, outcome.id];
    });
  }

  async function placeBet() {
    if (!game || !selectedOutcomeIds.length) return;
    if (!Number.isFinite(stakeCoins) || stakeCoins <= 0 || Math.round(stakeCoins * 100) !== stakeCoins * 100) return showToast("Enter a positive stake with up to two decimals.", "warning");
    if (!wallet || stakeCoins > coinsFromUnits(wallet.balance_units)) return showToast("You do not have enough coins for that stake.", "warning");
    setPlacing(true);
    const { error } = await supabase.rpc("place_league_bet", {
      target_game_id: game.id,
      selected_outcome_ids: selectedOutcomeIds,
      stake_coins: stakeCoins,
      client_request_id: crypto.randomUUID()
    });
    setPlacing(false);
    if (error) return showToast(friendlyActionError(error, "Your bet could not be placed. Please try again."), "error");
    showToast(`${selectedOutcomeIds.length === 1 ? "Bet" : "Bet builder"} placed at ${builderOdds.toFixed(2)} odds.`, "success", true);
    setSelectedOutcomeIds([]);
    setStake("");
    await betting.reload();
  }

  async function cashOutBet() {
    if (!cashOutSlip || cashingOut) return;
    setCashingOut(true);
    const { data, error } = await supabase.rpc("cash_out_bet", { target_slip_id: cashOutSlip.id });
    setCashingOut(false);
    if (error) return showToast(friendlyActionError(error, "This bet could not be cashed out. Please try again."), "error");
    const result = data as { refund_units?: number } | null;
    showToast(`Bet cashed out. ${formatCoins(Number(result?.refund_units ?? cashOutSlip.stake_units))} coins returned.`, "success");
    setCashOutSlip(null);
    await betting.reload();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <Toast
        message={toast?.message || null}
        tone={toast?.tone}
        duration={toastLinksToMyBets ? 6000 : 3200}
        actionLabel={toastLinksToMyBets ? "View in My Bets" : undefined}
        onAction={toastLinksToMyBets ? () => {
          setToast(null);
          setToastLinksToMyBets(false);
          setTab("mine");
        } : undefined}
        onDone={() => {
          setToast(null);
          setToastLinksToMyBets(false);
        }}
      />
      <ConfirmDialog open={!!cashOutSlip} title="Cash out this bet?" text={cashOutSlip ? `Your full ${formatCoins(cashOutSlip.stake_units)} coin stake will be returned. The bet will be permanently cancelled and cannot be restored.` : undefined} confirmLabel={cashingOut ? "Cashing out..." : "Cash out bet"} confirmTone="primary" cancelLabel="Keep bet" onCancel={() => { if (!cashingOut) setCashOutSlip(null); }} onConfirm={cashOutBet} />

      <PlaySwitcher active="bets" />
      <TabList idPrefix="betting" label="Betting sections" tabs={[{ id: "markets", label: "Markets" }, { id: "mine", label: "My Bets" }, { id: "standings", label: "Standings" }]} active={tab} onChange={setTab} />
      <BettingBalance balanceUnits={balanceUnits} lockAt={tab === "markets" && marketGameOpen ? lockAt : undefined} lockMinutes={lockMinutes} isOpen={isOpen} compact />

      {tab === "markets" ? (
        <div id="betting-markets-panel" role="tabpanel" aria-labelledby="betting-markets-tab">
          {!marketGameOpen ? (
            <BetGameList games={availableGames} data={league.data} allMarkets={betting.data.markets} lockMinutes={lockMinutes} now={now} onGame={openGameMarkets} />
          ) : game ? (
            <div className="space-y-4">
              <SelectedGameHeader game={game} data={league.data} marketCount={markets.length} isOpen={isOpen} onBack={closeGameMarkets} />
              {isOpen && !hasBetForSelectedGame ? (
                <TiloMoment
                  pose="matchday-ready"
                  eyebrow="Tilo's matchday note"
                  title="Markets are open."
                  text={`Review your choices. Betting locks ${lockMinutes} minute${lockMinutes === 1 ? "" : "s"} before kickoff, and coins stay virtual.`}
                />
              ) : null}
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                  <label className="relative block">
                    <span className="sr-only">Search betting markets</span>
                    <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-league-gold/60" size={18} />
                    <TextInput value={marketQuery} onChange={event => setMarketQuery(event.target.value)} placeholder="Search player or market…" className="rounded-[1.1rem] bg-ink-850 pl-11" />
                  </label>
                  {bettingCategoryOrder.map(category => {
                    const normalizedQuery = marketQuery.trim().toLowerCase();
                    const categoryMarkets = markets.filter(market => market.market_type === category.type && (!normalizedQuery || market.title.toLowerCase().includes(normalizedQuery)));
                    if (!categoryMarkets.length) return null;
                    return <MarketSection key={category.type} label={category.label} icon={category.icon} markets={categoryMarkets} outcomes={outcomes} lineups={lineups} selected={selectedOutcomeIds} disabled={!isOpen} onToggle={toggleOutcome} />;
                  })}
                  {marketQuery.trim() && !markets.some(market => market.title.toLowerCase().includes(marketQuery.trim().toLowerCase())) ? <EmptyState title="No matching markets" text="Try another player name or market type." /> : null}
                  {!markets.length ? <EmptyState title="No markets for this game" text="The published markets may have been removed or returned to draft." /> : null}
                </div>
                <div className="hidden xl:block"><BetSlipCard markets={markets} outcomes={selectedOutcomes} odds={builderOdds} stake={stake} potentialReturn={potentialReturn} balanceUnits={balanceUnits} disabled={!isOpen} placing={placing} onStake={setStake} onRemove={id => setSelectedOutcomeIds(current => current.filter(item => item !== id))} onPlace={placeBet} /></div>
                <div className="xl:hidden"><BetSlipDrawer markets={markets} outcomes={selectedOutcomes} odds={builderOdds} stake={stake} potentialReturn={potentialReturn} balanceUnits={balanceUnits} disabled={!isOpen} placing={placing} onStake={setStake} onRemove={id => setSelectedOutcomeIds(current => current.filter(item => item !== id))} onPlace={placeBet} /></div>
              </div>
            </div>
          ) : <EmptyState title="Game unavailable" text="Return to the game list and choose another match." />}
        </div>
      ) : null}

      {tab === "mine" ? <div id="betting-mine-panel" role="tabpanel" aria-labelledby="betting-mine-tab"><BetHistory slips={betting.data.slips.filter(slip => slip.user_id === user?.id)} games={league.data.games} markets={betting.data.markets} outcomes={betting.data.outcomes} allLegs={betting.data.legs} now={now} onCashOut={setCashOutSlip} /></div> : null}

      {tab === "standings" ? <div id="betting-standings-panel" role="tabpanel" aria-labelledby="betting-standings-tab"><BetStandings userId={user?.id} seasonId={seasonId} seasons={league.data.seasons} profiles={league.data.profiles} standings={social.standings} loading={social.loading} error={social.error} onSeason={setSeasonId} onRetry={social.reload} /></div> : null}
    </div>
  );
}

function lockTime(game: Game, lockMinutes: number) {
  return new Date(new Date(game.game_date).getTime() - lockMinutes * 60_000);
}

function bettingOpen(game: Game, markets: BettingMarket[], lockMinutes: number, now: number) {
  return (game.status === "upcoming" || game.status === "draft")
    && now < lockTime(game, lockMinutes).getTime()
    && markets.some(market => market.status === "open");
}

function BetGameList({ games, data, allMarkets, lockMinutes, now, onGame }: { games: Game[]; data: LeagueData; allMarkets: BettingMarket[]; lockMinutes: number; now: number; onGame: (id: string) => void }) {
  if (!games.length) return <EmptyState title="No betting markets yet" text="Games appear here after the lineups are confirmed and an admin publishes the odds." />;
  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
      <div className="flex items-start gap-3 border-b border-league-gold/15 px-4 py-4 sm:px-5">
        <ShieldCheck size={19} className="mt-0.5 shrink-0 text-league-gold" />
        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/70">Available games</div><h1 className="mt-0.5 font-display text-2xl uppercase">Choose a match</h1><p className="mt-1 text-xs leading-relaxed text-chalk/60">Your slips and stakes stay private. Only you and league administrators can see them.</p></div>
      </div>
      <div className="divide-y divide-league-gold/18">
        {games.map(game => {
          const gameMarkets = allMarkets.filter(market => market.game_id === game.id && market.status !== "draft");
          return <BetGameCard key={game.id} game={game} data={data} marketCount={gameMarkets.length} isOpen={bettingOpen(game, gameMarkets, lockMinutes, now)} onClick={() => onGame(game.id)} />;
        })}
      </div>
    </section>
  );
}

function BetGameCard({ game, data, marketCount, isOpen, onClick }: { game: Game; data: LeagueData; marketCount: number; isOpen: boolean; onClick: () => void }) {
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const score = calculateScore(data.events.filter(event => event.game_id === game.id), lineups, data.playerStats.filter(stat => stat.game_id === game.id));
  const showScore = game.status === "live" || game.status === "final";
  return (
    <button type="button" onClick={onClick} className="group grid w-full gap-3 px-3 py-4 text-left transition hover:bg-league-gold/[.055] focus:outline-none focus-visible:bg-league-gold/[.075] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="min-w-0">
        <div className="mb-2 inline-flex items-center gap-1.5 font-mono text-[9px] text-chalk/30"><CalendarDays size={11} /> {formatDateTime(game.game_date)}</div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <BetTeam gameId={game.id} team="A" />
          <span className="font-mono text-xl font-black">{showScore ? <>{score.A}<span className="px-1.5 text-chalk/25">–</span>{score.B}</> : <span className="font-display uppercase text-chalk/35">vs</span>}</span>
          <BetTeam gameId={game.id} team="B" reverse />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-league-gold/18 pt-3 sm:min-w-44 sm:justify-end sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 sm:text-right">
        <div><div className={cn("text-[10px] font-black uppercase tracking-wider", isOpen ? "text-turf-400" : "text-chalk/35")}>{isOpen ? "Bets open" : "Betting closed"}</div><div className="mt-1 text-xs text-chalk/40">{marketCount} market{marketCount === 1 ? "" : "s"}</div></div>
        <ChevronRight size={18} className="text-chalk/20 transition group-hover:translate-x-0.5 group-hover:text-league-gold" />
      </div>
    </button>
  );
}

function SelectedGameHeader({ game, data, marketCount, isOpen, onBack }: { game: Game; data: LeagueData; marketCount: number; isOpen: boolean; onBack: () => void }) {
  const lineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const score = calculateScore(data.events.filter(event => event.game_id === game.id), lineups, data.playerStats.filter(stat => stat.game_id === game.id));
  const showScore = game.status === "live" || game.status === "final";
  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
      <div className="flex items-center justify-between border-b border-league-gold/15 px-4 py-2.5 sm:px-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-chalk/45 transition hover:text-league-gold"><ArrowLeft size={14} /> All betting games</button>
        <span className={cn("rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider", isOpen ? "border-turf-400/20 bg-turf-400/[.07] text-turf-100" : "border-chalk/[.07] bg-chalk/[.025] text-chalk/35")}>{isOpen ? "Open" : "Closed"}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4 sm:px-5">
        <BetTeam gameId={game.id} team="A" large />
        <div className="text-center"><div className="font-mono text-2xl font-black">{showScore ? <>{score.A}<span className="px-1.5 text-chalk/25">–</span>{score.B}</> : <span className="font-display uppercase text-chalk/35">vs</span>}</div><div className="mt-1 font-mono text-[9px] text-chalk/30">{formatDateTime(game.game_date)}</div><div className="mt-1 text-[9px] uppercase tracking-wider text-league-gold/60">{marketCount} markets</div></div>
        <BetTeam gameId={game.id} team="B" reverse large />
      </div>
    </section>
  );
}

function BetTeam({ gameId, team, reverse = false, large = false }: { gameId: string; team: "A" | "B"; reverse?: boolean; large?: boolean }) {
  return <div className={cn("flex min-w-0 items-center gap-2", reverse && "flex-row-reverse text-right")}><TeamCrest gameId={gameId} team={team} className={large ? "h-12 w-10 shrink-0 sm:h-14 sm:w-11" : "h-9 w-8 shrink-0 sm:h-11 sm:w-9"} /><span className={cn("truncate font-bold", large ? "text-sm" : "text-xs")}>Team {team}</span></div>;
}

type BetHistoryFilter = "all" | "open" | "settled" | "cashed_out";

function betMatchesFilter(slip: BetSlip, filter: BetHistoryFilter) {
  if (filter === "all") return true;
  if (filter === "open") return slip.status === "pending";
  if (filter === "cashed_out") return slip.status === "cashed_out";
  return slip.status === "won" || slip.status === "lost" || slip.status === "void";
}

function betStatusLabel(status: BetSlip["status"]) {
  if (status === "pending") return "Open";
  if (status === "cashed_out") return "Cashed out";
  if (status === "void") return "Voided";
  return status;
}

function BetHistory({ slips, games, markets, outcomes, allLegs, now, onCashOut }: { slips: BetSlip[]; games: Game[]; markets: BettingMarket[]; outcomes: BettingOutcome[]; allLegs: import("@/lib/types").BetLeg[]; now: number; onCashOut: (slip: BetSlip) => void }) {
  const [filter, setFilter] = useState<BetHistoryFilter>("all");
  if (!slips.length) return <EmptyState title="No bets yet" text="Your open and settled slips will appear here." />;

  const orderedSlips = [...slips].sort((first, second) => new Date(second.placed_at).getTime() - new Date(first.placed_at).getTime());
  const filteredSlips = orderedSlips.filter(slip => betMatchesFilter(slip, filter));
  const filters: { id: BetHistoryFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: slips.length },
    { id: "open", label: "Open", count: slips.filter(slip => betMatchesFilter(slip, "open")).length },
    { id: "settled", label: "Settled", count: slips.filter(slip => betMatchesFilter(slip, "settled")).length },
    { id: "cashed_out", label: "Cashed Out", count: slips.filter(slip => betMatchesFilter(slip, "cashed_out")).length }
  ];

  return (
    <div className="space-y-3">
      <div className="flex overflow-x-auto rounded-[1.1rem] border border-league-gold/25 bg-ink-850 p-1" role="group" aria-label="Filter My Bets">
        {filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={cn("flex min-w-max flex-1 items-center justify-center gap-1.5 rounded-[.8rem] px-3 py-2.5 text-xs font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", filter === item.id ? "bg-league-gold/[.09] text-league-gold" : "text-chalk/40 hover:bg-chalk/[.025] hover:text-chalk")}><span>{item.label}</span><span className="rounded-full border border-chalk/[.06] bg-chalk/[.025] px-1.5 py-0.5 font-mono text-[9px] text-chalk/35">{item.count}</span></button>)}
      </div>

      {!filteredSlips.length ? <EmptyState title={`No ${filter === "cashed_out" ? "cashed-out" : filter} bets`} text="Bets matching this status will appear here." /> : filteredSlips.map(slip => {
        const game = games.find(item => item.id === slip.game_id);
        const legs = allLegs.filter(leg => leg.slip_id === slip.id);
        const canCashOut = slip.status === "pending" && !!game && (game.status === "upcoming" || game.status === "draft") && now < new Date(game.game_date).getTime();
        const statusTone = slip.status === "won" ? "text-turf-400 border-turf-400/25 bg-turf-400/[.07]" : slip.status === "lost" ? "text-red-300 border-red-400/25 bg-red-400/[.07]" : slip.status === "void" || slip.status === "cashed_out" ? "text-chalk/45 border-chalk/[.07] bg-chalk/[.025]" : "text-league-gold border-league-gold/25 bg-league-gold/[.07]";
        const payout = slip.status === "pending" ? slip.potential_payout_units : slip.status === "cashed_out" ? slip.stake_units : (slip.settled_payout_units || 0);
        const payoutLabel = slip.status === "pending" ? "Potential" : slip.status === "cashed_out" ? "Refunded" : "Paid";
        return (
          <section key={slip.id} className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-league-gold/10 px-4 py-3.5 sm:px-5">
              <div><div className="flex items-center gap-2"><span className="rounded-full border border-chalk/[.07] bg-chalk/[.025] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-chalk/45">{slip.slip_type}</span><span className="text-[10px] text-chalk/30">{new Date(slip.placed_at).toLocaleString()}</span></div><h2 className="mt-2 font-display text-xl uppercase sm:text-2xl">{game ? formatDateTime(game.game_date) : "Game"}</h2></div>
              <div className="text-right"><div className="mb-1 text-[8px] font-black uppercase tracking-widest text-chalk/25">Status</div><span className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider", statusTone)}>{betStatusLabel(slip.status)}</span></div>
            </div>
            <div className="p-3 sm:p-4">
              <div className="space-y-2">{legs.map(leg => {
                const market = markets.find(item => item.id === leg.market_id);
                const outcome = outcomes.find(item => item.id === leg.outcome_id);
                return <div key={leg.id} className="flex items-center justify-between gap-3 rounded-xl border border-chalk/[.06] bg-black/15 px-3 py-2.5 text-sm"><span className="min-w-0 truncate text-chalk/60">{market?.title}: <strong className="text-chalk/85">{outcome?.label}</strong></span><span className="flex shrink-0 items-center gap-2 font-mono text-league-gold">{Number(leg.accepted_odds).toFixed(2)} {leg.status === "won" ? <Check size={15} className="text-turf-400" /> : leg.status === "lost" ? <X size={15} className="text-red-300" /> : null}</span></div>;
              })}</div>
              <SlipNumbers stake={slip.stake_units} odds={Number(slip.accepted_odds)} payout={payout} payoutLabel={payoutLabel} />
              {canCashOut ? <div className="mt-3 flex flex-col gap-3 rounded-xl border border-league-gold/15 bg-league-gold/[.045] p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-semibold">Full-stake cash-out available</div><div className="mt-1 text-xs text-chalk/40">Available until scheduled kickoff.</div></div><button type="button" onClick={() => onCashOut(slip)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-league-gold/25 bg-league-gold/[.08] px-3 py-2 text-sm font-bold text-league-gold transition hover:bg-league-gold/[.14]"><HandCoins size={17} /> Cash out</button></div> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function rankBettingStandings(standings: BettingStanding[]) {
  const ordered = [...standings].sort((first, second) => second.settled_profit_units - first.settled_profit_units || first.username.localeCompare(second.username));
  let previousRank = 0;
  return ordered.map((row, index) => {
    const rank = index > 0 && row.settled_profit_units === ordered[index - 1].settled_profit_units ? previousRank : index + 1;
    previousRank = rank;
    return { ...row, rank };
  });
}

function BetStandings({ userId, seasonId, seasons, profiles, standings, loading, error, onSeason, onRetry }: { userId?: string; seasonId: string; seasons: import("@/lib/types").Season[]; profiles: Profile[]; standings: BettingStanding[]; loading: boolean; error: string | null; onSeason: (id: string) => void; onRetry: () => void | Promise<void> }) {
  if (loading) return <LoadingState label="Loading bet standings" cards={3} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  const rankedStandings = rankBettingStandings(standings);
  return (
    <div className="mx-auto max-w-3xl">
      <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-league-gold/15 p-4 sm:p-5">
          <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/70">Betting table</div><h2 className="mt-1 font-display text-3xl uppercase">Standings</h2><p className="mt-1 text-sm text-chalk/45">Ranked by settled profit · equal profit shares a rank</p></div>
          <Select value={seasonId} onChange={event => onSeason(event.target.value)} className="w-full rounded-xl border-league-gold/15 py-2 text-sm sm:w-56" aria-label="Betting standings season">{seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</Select>
        </div>
        {rankedStandings.length ? <ol className="divide-y divide-league-gold/18">{rankedStandings.map(row => <li key={row.user_id} className={cn("grid grid-cols-[2.4rem_2rem_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-3.5 sm:px-5", row.user_id === userId && "bg-league-gold/[.055]")}><span className={cn("grid h-8 w-8 place-items-center rounded-lg font-mono text-xs font-bold", row.rank <= 3 ? "bg-league-gold/10 text-league-gold" : "bg-chalk/[.035] text-chalk/55")}>#{row.rank}</span><AccountAvatar profile={profiles.find(profile => profile.id === row.user_id)} name={row.username} className="h-8 w-8 text-[10px]" /><div className="min-w-0"><div className="truncate font-semibold">{row.username}{row.user_id === userId ? <span className="ml-2 text-xs font-normal text-league-gold">you</span> : null}</div><div className="mt-0.5 text-[10px] text-chalk/55">{row.won_bets}/{row.settled_bets} won · {row.total_bets} total</div></div><div className="text-right"><CoinAmount units={row.settled_profit_units} iconSize={15} className={cn("font-semibold", row.settled_profit_units >= 0 ? "text-turf-400" : "text-red-300")} /><div className="mt-1 text-[10px] uppercase tracking-wider text-chalk/55">profit</div></div></li>)}</ol> : <p className="p-8 text-center text-sm text-chalk/60">No settled betting results in this season yet.</p>}
      </section>

    </div>
  );
}

function SlipNumbers({ stake, odds, payout, payoutLabel }: { stake: number; odds: number; payout: number; payoutLabel: string }) {
  return <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg border border-chalk/[.055] bg-chalk/[.02] p-2"><div className="text-[9px] uppercase tracking-wider text-chalk/30">Stake</div><CoinAmount units={stake} iconSize={13} className="mt-1 text-xs sm:text-sm" /></div><div className="rounded-lg border border-chalk/[.055] bg-chalk/[.02] p-2"><div className="text-[9px] uppercase tracking-wider text-chalk/30">Odds</div><div className="mt-1 font-mono text-sm">{odds.toFixed(2)}</div></div><div className="rounded-lg border border-chalk/[.055] bg-chalk/[.02] p-2"><div className="text-[9px] uppercase tracking-wider text-chalk/30">{payoutLabel}</div><CoinAmount units={payout} iconSize={13} className="mt-1 text-xs text-league-gold sm:text-sm" /></div></div>;
}
