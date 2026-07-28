"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronDown, Ticket, X } from "lucide-react";
import { FaFutbol } from "react-icons/fa6";
import { GiGoalKeeper, GiSoccerKick, GiTrophyCup } from "react-icons/gi";
import { TbArrowsExchange, TbScoreboard } from "react-icons/tb";
import type { IconType } from "react-icons";
import { BettingMarket, BettingMarketType, BettingOutcome, GameLineup, TeamCode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CoinAmount, LeagueCoin } from "./LeagueCoin";
import { Pill, PrimaryButton, TextInput } from "./ui";

export const bettingCategoryOrder: { type: BettingMarketType; label: string; icon: IconType }[] = [
  { type: "match_result", label: "Match result", icon: GiTrophyCup },
  { type: "total_goals", label: "Total goals", icon: TbScoreboard },
  { type: "player_goals", label: "Player goals", icon: FaFutbol },
  { type: "player_assists", label: "Player assists", icon: GiSoccerKick },
  { type: "goalkeeper_saves", label: "Goalkeeper saves", icon: GiGoalKeeper },
  { type: "team_saves", label: "Team saves", icon: GiGoalKeeper },
  { type: "own_goal", label: "Own goal", icon: TbArrowsExchange }
];

function useLockCountdown(lockAt?: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!lockAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [lockAt]);
  if (!lockAt) return { expired: false, label: "" };
  const remaining = Math.max(lockAt.getTime() - now, 0);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
  return { expired: remaining <= 0, label };
}

export function BettingBalance({ balanceUnits, lockAt, lockMinutes = 5, isOpen, compact = false }: { balanceUnits: number; lockAt?: Date | null; lockMinutes?: number; isOpen?: boolean; compact?: boolean }) {
  const countdown = useLockCountdown(lockAt);
  const visiblyOpen = !!isOpen && !countdown.expired;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[1.3rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]", compact ? "px-4 py-3" : "px-5 py-4")}>
      <div className="flex items-center gap-3">
        <LeagueCoin size={compact ? 38 : 46} />
        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-league-gold/65">Your balance</div><CoinAmount units={balanceUnits} iconSize={0} className={cn("mt-0.5 font-bold text-league-gold", compact ? "text-2xl" : "text-3xl")} /></div>
      </div>
      {lockAt ? <div className="text-right"><div className="flex items-center justify-end gap-2 text-xs font-semibold text-chalk/60"><CalendarClock size={15} className="text-league-gold/70" /> {visiblyOpen ? `Closes in ${countdown.label}` : "Betting closed"}</div><div className={cn("mt-1 text-[9px] font-black uppercase tracking-widest", visiblyOpen ? "text-turf-400" : "text-red-300")}>{lockMinutes} min before kickoff · {visiblyOpen ? "Bets open" : "Bets closed"}</div></div> : <div className="text-xs text-chalk/35">Season coins</div>}
    </div>
  );
}

export function MarketSection({ label, icon: Icon, markets, outcomes, lineups = [], selected, disabled, onToggle }: { label: string; icon: IconType; markets: BettingMarket[]; outcomes: BettingOutcome[]; lineups?: GameLineup[]; selected: string[]; disabled: boolean; onToggle: (outcome: BettingOutcome) => void }) {
  const [open, setOpen] = useState(true);
  const splitByTeam = markets.some(market => market.subject_player_id || market.subject_team);

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)]">
      <button type="button" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-chalk/[.02] sm:px-5">
        <span className="flex min-w-0 items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-league-gold/15 bg-league-gold/[.06] text-league-gold"><Icon size={18} /></span><span className="truncate font-display text-xl uppercase sm:text-2xl">{label}</span><span className="rounded-full border border-chalk/[.07] bg-chalk/[.025] px-2 py-0.5 font-mono text-[10px] text-chalk/35">{markets.length}</span></span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-chalk/35">{open ? "Hide" : "Show"}<ChevronDown size={17} className={cn("transition", open && "rotate-180")} /></span>
      </button>
      {open ? splitByTeam ? (
        <div className="grid gap-3 border-t border-league-gold/10 p-3 sm:p-4 md:grid-cols-2">
          <TeamMarkets team="A" markets={markets} outcomes={outcomes} lineups={lineups} selected={selected} disabled={disabled} onToggle={onToggle} />
          <TeamMarkets team="B" markets={markets} outcomes={outcomes} lineups={lineups} selected={selected} disabled={disabled} onToggle={onToggle} />
        </div>
      ) : (
        <div className="border-t border-league-gold/10 p-3 sm:p-4">
          <MarketGroup title={markets[0]?.title || label} markets={markets} outcomes={outcomes} selected={selected} disabled={disabled} onToggle={onToggle} />
        </div>
      ) : null}
    </section>
  );
}

function TeamMarkets({ team, markets, outcomes, lineups, selected, disabled, onToggle }: { team: TeamCode; markets: BettingMarket[]; outcomes: BettingOutcome[]; lineups: GameLineup[]; selected: string[]; disabled: boolean; onToggle: (outcome: BettingOutcome) => void }) {
  const teamTotalMarkets = markets.filter(market => market.subject_team === team);
  const playerIds = [...new Set(markets.filter(market => lineups.some(lineup => lineup.team === team && lineup.player_id === market.subject_player_id)).map(market => market.subject_player_id).filter(Boolean))] as string[];
  playerIds.sort((first, second) => {
    const firstLineup = lineups.find(lineup => lineup.player_id === first);
    const secondLineup = lineups.find(lineup => lineup.player_id === second);
    if (firstLineup?.role !== secondLineup?.role) return firstLineup?.role === "goalkeeper" ? -1 : 1;
    return (firstLineup?.slot_index ?? 99) - (secondLineup?.slot_index ?? 99);
  });

  return (
    <section className={cn("rounded-[1rem] border p-2.5", team === "A" ? "border-turf-400/20 bg-turf-400/[.025]" : "border-league-gold/20 bg-league-gold/[.025]")}>
      <div className={cn("mb-2.5 border-b pb-2 text-center text-[10px] font-black uppercase tracking-[.2em]", team === "A" ? "border-turf-400/10 text-turf-100/70" : "border-league-gold/10 text-league-gold/75")}>Team {team}</div>
      <div className="space-y-3">
        {teamTotalMarkets.length ? <MarketGroup title={`Team ${team} total saves`} markets={teamTotalMarkets} outcomes={outcomes} selected={selected} disabled={disabled} onToggle={onToggle} /> : null}
        {playerIds.map(playerId => {
          const playerMarkets = markets.filter(market => market.subject_player_id === playerId).sort((first, second) => Number(first.line || 0) - Number(second.line || 0));
          return <MarketGroup key={playerId} title={playerMarkets[0]?.title || "Player"} markets={playerMarkets} outcomes={outcomes} selected={selected} disabled={disabled} onToggle={onToggle} />;
        })}
        {!playerIds.length && !teamTotalMarkets.length ? <p className="py-4 text-center text-sm text-chalk/40">No markets for Team {team}.</p> : null}
      </div>
    </section>
  );
}

function MarketGroup({ title, markets, outcomes, selected, disabled, onToggle }: { title: string; markets: BettingMarket[]; outcomes: BettingOutcome[]; selected: string[]; disabled: boolean; onToggle: (outcome: BettingOutcome) => void }) {
  return (
    <section className="rounded-[.9rem] border border-chalk/[.065] bg-black/15 p-2.5 sm:p-3">
      <h3 className="mb-2.5 truncate text-xs font-bold text-chalk/80 sm:text-sm">{title}</h3>
      <div className="space-y-2">
        {markets.sort((first, second) => Number(first.line || 0) - Number(second.line || 0)).map(market => {
          const marketOutcomes = outcomes.filter(outcome => outcome.market_id === market.id);
          return (
            <div key={market.id} className={cn("grid items-stretch gap-2", market.line != null ? "grid-cols-[auto_1fr]" : "grid-cols-1")}>
              {market.line != null ? <div className="grid min-w-12 place-items-center rounded-lg border border-chalk/[.065] bg-chalk/[.025] px-2 font-mono text-xs text-chalk/50">{Number(market.line).toFixed(1)}</div> : null}
              <div className={cn("grid gap-2", marketOutcomes.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {marketOutcomes.map(outcome => {
                  const active = selected.includes(outcome.id);
                  const compactLabel = market.line == null ? outcome.label : outcome.label.split(" ")[0];
                  return <button key={outcome.id} type="button" disabled={disabled} aria-pressed={active} aria-label={`${title}: ${outcome.label}`} onClick={() => onToggle(outcome)} className={cn("min-h-11 min-w-0 rounded-lg border px-2 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:cursor-not-allowed disabled:opacity-45", active ? "border-league-gold/55 bg-league-gold/[.11]" : "border-chalk/[.065] bg-chalk/[.025] hover:border-league-gold/30 hover:bg-league-gold/[.045]")}><span className={cn("block truncate text-[10px]", active ? "text-league-gold/75" : "text-chalk/45")}>{compactLabel}</span><span className={cn("mt-0.5 block font-mono text-sm font-bold sm:text-base", active ? "text-league-gold" : "text-chalk/85")}>{Number(outcome.offered_odds).toFixed(2)}</span></button>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BetSlipCard({ markets, outcomes, odds, stake, potentialReturn, balanceUnits, disabled, placing, onStake, onRemove, onPlace }: { markets: BettingMarket[]; outcomes: BettingOutcome[]; odds: number; stake: string; potentialReturn: number; balanceUnits: number; disabled: boolean; placing: boolean; onStake: (value: string) => void; onRemove: (id: string) => void; onPlace: () => void }) {
  return (
    <section className="h-fit overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.13)] xl:sticky xl:top-24">
      <div className="flex items-center justify-between border-b border-league-gold/15 px-4 py-3.5">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg border border-league-gold/15 bg-league-gold/[.06] text-league-gold"><Ticket size={17} /></span><h2 className="font-display text-2xl uppercase">Bet slip</h2></div>
        {outcomes.length > 1 ? <Pill className="border-league-gold/15 bg-league-gold/[.05] text-league-gold">Builder</Pill> : outcomes.length === 1 ? <Pill className="border-league-gold/15 bg-league-gold/[.05] text-league-gold">Single</Pill> : null}
      </div>
      <div className="p-4">
        {!outcomes.length ? <div className="rounded-xl border border-dashed border-chalk/[.09] p-6 text-center text-sm text-chalk/40">Choose an outcome to start a slip.</div> : (
          <div className="space-y-2">
            {outcomes.map(outcome => {
              const market = markets.find(item => item.id === outcome.market_id);
              return <div key={outcome.id} className="flex items-start justify-between gap-3 rounded-xl border border-chalk/[.06] bg-black/15 p-3"><div className="min-w-0"><div className="truncate text-[10px] text-chalk/35">{market?.title}</div><div className="mt-1 truncate text-sm font-semibold">{outcome.label} <span className="ml-1 font-mono text-league-gold">{Number(outcome.offered_odds).toFixed(2)}</span></div></div><button type="button" onClick={() => onRemove(outcome.id)} className="rounded-lg p-1 text-chalk/35 transition hover:bg-chalk/[.04] hover:text-chalk" aria-label={`Remove ${outcome.label}`}><X size={15} /></button></div>;
            })}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-chalk/[.055] bg-chalk/[.02] p-3"><div className="text-[9px] uppercase tracking-wider text-chalk/30">Accepted odds</div><div className="mt-1 font-mono text-xl">{outcomes.length ? odds.toFixed(2) : "—"}</div></div><div className="rounded-xl border border-chalk/[.055] bg-chalk/[.02] p-3"><div className="text-[9px] uppercase tracking-wider text-chalk/30">Potential return</div><div className="mt-1 text-league-gold">{potentialReturn ? <CoinAmount units={Math.round(potentialReturn * 100)} iconSize={18} className="text-lg" /> : <span className="font-mono text-xl">—</span>}</div></div></div>
        <label className="mt-3 block"><span className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-chalk/40"><span>Stake</span><CoinAmount units={balanceUnits} iconSize={14} /></span><TextInput type="number" min="0.01" step="0.01" inputMode="decimal" value={stake} onChange={event => onStake(event.target.value)} placeholder="Coins" className="rounded-xl border-league-gold/15 py-2.5 focus:border-league-gold focus:ring-league-gold" /></label>
        <QuickStakeButtons stake={stake} balanceUnits={balanceUnits} onStake={onStake} />
        <PrimaryButton type="button" className="mt-3 w-full rounded-xl bg-league-gold py-3 shadow-none" disabled={disabled || placing || !outcomes.length || Number(stake) <= 0} onClick={onPlace}>{placing ? "Placing…" : outcomes.length > 1 ? "Place bet builder" : "Place bet"}</PrimaryButton>
        <p className="mt-3 text-center text-[10px] text-chalk/30">Your available coin balance is the stake limit.</p>
      </div>
    </section>
  );
}

export function BetSlipDrawer({ markets, outcomes, odds, stake, potentialReturn, balanceUnits, disabled, placing, onStake, onRemove, onPlace }: { markets: BettingMarket[]; outcomes: BettingOutcome[]; odds: number; stake: string; potentialReturn: number; balanceUnits: number; disabled: boolean; placing: boolean; onStake: (value: string) => void; onRemove: (id: string) => void; onPlace: () => void }) {
  const [open, setOpen] = useState(true);
  const previousCount = useRef(0);

  useEffect(() => {
    if (previousCount.current === 0 && outcomes.length > 0) setOpen(true);
    previousCount.current = outcomes.length;
  }, [outcomes.length]);

  if (!outcomes.length) return null;

  return (
    <aside className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-[65] w-[min(calc(100vw-1rem),42rem)] -translate-x-1/2 lg:bottom-4" aria-label="Current bet slip">
      <div className="max-h-[58vh] overflow-y-auto rounded-[1.4rem] border border-league-gold/40 bg-ink-900/95 p-3 shadow-[0_18px_55px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-4">
        <button type="button" onClick={() => setOpen(current => !current)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
          <span className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-league-gold/10 text-league-gold"><Ticket size={17} /></span><span><span className="block text-sm font-extrabold">{outcomes.length} selection{outcomes.length === 1 ? "" : "s"}</span><span className="block text-[10px] uppercase tracking-wider text-chalk/35">{outcomes.length > 1 ? "Bet builder" : "Single bet"}</span></span></span>
          <span className="flex shrink-0 items-center gap-3"><span className="text-right"><span className="block text-[9px] uppercase tracking-wider text-chalk/35">Odds</span><span className="font-mono font-bold text-league-gold">{odds.toFixed(2)}</span></span><ChevronDown size={18} className={cn("text-chalk/40 transition", open && "rotate-180")} /></span>
        </button>

        {open ? (
          <div className="mt-3 border-t border-league-gold/15 pt-3">
            <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {outcomes.map(outcome => {
                const market = markets.find(item => item.id === outcome.market_id);
                return <div key={outcome.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2"><div className="min-w-0"><div className="truncate text-[10px] text-chalk/35">{market?.title}</div><div className="truncate text-xs font-semibold">{outcome.label} <span className="font-mono text-league-gold">{Number(outcome.offered_odds).toFixed(2)}</span></div></div><button type="button" onClick={() => onRemove(outcome.id)} className="shrink-0 rounded-lg p-1.5 text-chalk/35 hover:bg-chalk/5 hover:text-chalk" aria-label={`Remove ${outcome.label}`}><X size={15} /></button></div>;
              })}
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <label className="min-w-0"><span className="sr-only">Bet stake in coins</span><TextInput type="number" min="0.01" step="0.01" inputMode="decimal" value={stake} onChange={event => onStake(event.target.value)} placeholder="Stake in coins" className="h-11 rounded-xl py-2" /></label>
              <PrimaryButton type="button" className="h-11 rounded-xl px-4" disabled={disabled || placing || Number(stake) <= 0} onClick={onPlace}>{placing ? "Placing…" : "Place bet"}</PrimaryButton>
            </div>
            <QuickStakeButtons stake={stake} balanceUnits={balanceUnits} onStake={onStake} compact />
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-chalk/35"><span>Balance <CoinAmount units={balanceUnits} iconSize={12} className="text-chalk/60" /></span><span>Potential <CoinAmount units={Math.round(potentialReturn * 100)} iconSize={12} className="text-league-gold" /></span></div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function QuickStakeButtons({ stake, balanceUnits, onStake, compact = false }: { stake: string; balanceUnits: number; onStake: (value: string) => void; compact?: boolean }) {
  const balance = balanceUnits / 100;

  function setAmount(amount: number) {
    const bounded = Math.max(0, Math.min(balance, Math.round(amount * 100) / 100));
    onStake(bounded ? String(bounded) : "");
  }

  function add(amount: number) {
    const current = Number(stake);
    setAmount((Number.isFinite(current) ? current : 0) + amount);
  }

  return (
    <div className={cn("grid grid-cols-4 gap-1.5", compact ? "mt-2" : "mt-2.5")} aria-label="Quick stake controls">
      {[5, 10, 25].map(amount => (
        <button key={amount} type="button" disabled={balance <= 0} onClick={() => add(amount)} className="min-h-11 rounded-lg border border-league-gold/15 bg-league-gold/[.045] px-2 text-xs font-bold text-league-gold/80 transition hover:border-league-gold/35 hover:bg-league-gold/[.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:opacity-40" aria-label={`Add ${amount} coins to stake`}>+{amount}</button>
      ))}
      <button type="button" disabled={balance <= 0} onClick={() => setAmount(balance)} className="min-h-11 rounded-lg border border-league-gold/15 bg-league-gold/[.045] px-2 text-xs font-bold text-league-gold/80 transition hover:border-league-gold/35 hover:bg-league-gold/[.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:opacity-40">Max</button>
    </div>
  );
}
