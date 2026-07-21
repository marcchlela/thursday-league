"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, Sparkles, Ticket, X } from "lucide-react";
import { BettingMarket, BettingMarketType, BettingOutcome, GameLineup, TeamCode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CoinAmount, LeagueCoin } from "./LeagueCoin";
import { Card, Pill, PrimaryButton, TextInput } from "./ui";

export const bettingCategoryOrder: { type: BettingMarketType; label: string }[] = [
  { type: "match_result", label: "Match result" },
  { type: "total_goals", label: "Total goals" },
  { type: "player_goals", label: "Player goals" },
  { type: "player_assists", label: "Player assists" },
  { type: "goalkeeper_saves", label: "Goalkeeper saves" },
  { type: "own_goal", label: "Own goal" }
];

export function BettingBalance({ balanceUnits, lockAt, isOpen, compact = false }: { balanceUnits: number; lockAt?: Date | null; isOpen?: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-floodlight/30 bg-gradient-to-r from-floodlight/15 to-floodlight/[.04] shadow-amber", compact ? "px-4 py-3" : "px-5 py-4")}>
      <div className="flex items-center gap-3">
        <LeagueCoin size={compact ? 38 : 46} />
        <div><div className="text-[11px] font-bold uppercase tracking-[.18em] text-floodlight/70">Your balance</div><CoinAmount units={balanceUnits} iconSize={0} className={cn("mt-0.5 text-floodlight", compact ? "text-2xl" : "text-3xl")} /></div>
      </div>
      {lockAt ? <div className="text-right"><div className="flex items-center justify-end gap-2 text-xs font-semibold text-chalk/65"><CalendarClock size={15} /> Locks {lockAt.toLocaleString()}</div><div className={cn("mt-1 text-[11px] font-bold uppercase tracking-widest", isOpen ? "text-turf-400" : "text-red-300")}>{isOpen ? "Markets open" : "Betting closed"}</div></div> : <div className="text-xs text-chalk/45">Season coins</div>}
    </div>
  );
}

export function MarketSection({ label, markets, outcomes, lineups = [], selected, disabled, onToggle }: { label: string; markets: BettingMarket[]; outcomes: BettingOutcome[]; lineups?: GameLineup[]; selected: string[]; disabled: boolean; onToggle: (outcome: BettingOutcome) => void }) {
  const [open, setOpen] = useState(true);
  const playerMarkets = markets.some(market => market.subject_player_id);

  return (
    <Card className="p-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex w-full items-center justify-between gap-3 p-5 text-left">
        <span className="flex items-center gap-2"><Sparkles size={17} className="text-floodlight" /><span className="font-display text-2xl uppercase">{label}</span><Pill>{markets.length}</Pill></span>
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-chalk/45">{open ? "Hide" : "Show"}<ChevronDown size={18} className={cn("transition", open && "rotate-180")} /></span>
      </button>
      {open ? playerMarkets ? (
        <div className="grid gap-4 border-t border-white/10 p-4 md:grid-cols-2">
          <TeamMarkets team="A" markets={markets} outcomes={outcomes} lineups={lineups} selected={selected} disabled={disabled} onToggle={onToggle} />
          <TeamMarkets team="B" markets={markets} outcomes={outcomes} lineups={lineups} selected={selected} disabled={disabled} onToggle={onToggle} />
        </div>
      ) : (
        <div className="border-t border-white/10 p-4">
          <MarketGroup title={markets[0]?.title || label} markets={markets} outcomes={outcomes} selected={selected} disabled={disabled} onToggle={onToggle} />
        </div>
      ) : null}
    </Card>
  );
}

function TeamMarkets({ team, markets, outcomes, lineups, selected, disabled, onToggle }: { team: TeamCode; markets: BettingMarket[]; outcomes: BettingOutcome[]; lineups: GameLineup[]; selected: string[]; disabled: boolean; onToggle: (outcome: BettingOutcome) => void }) {
  const playerIds = [...new Set(markets.filter(market => lineups.some(lineup => lineup.team === team && lineup.player_id === market.subject_player_id)).map(market => market.subject_player_id).filter(Boolean))] as string[];
  playerIds.sort((first, second) => {
    const firstLineup = lineups.find(lineup => lineup.player_id === first);
    const secondLineup = lineups.find(lineup => lineup.player_id === second);
    if (firstLineup?.role !== secondLineup?.role) return firstLineup?.role === "goalkeeper" ? -1 : 1;
    return (firstLineup?.slot_index ?? 99) - (secondLineup?.slot_index ?? 99);
  });

  return (
    <section className={cn("rounded-3xl border p-3", team === "A" ? "border-perimeter-400/25 bg-perimeter-400/[.05]" : "border-floodlight/25 bg-floodlight/[.04]")}>
      <div className={cn("mb-3 text-center text-xs font-black uppercase tracking-[.2em]", team === "A" ? "text-perimeter-400" : "text-floodlight")}>Team {team}</div>
      <div className="space-y-3">
        {playerIds.map(playerId => {
          const playerMarkets = markets.filter(market => market.subject_player_id === playerId).sort((first, second) => Number(first.line || 0) - Number(second.line || 0));
          return <MarketGroup key={playerId} title={playerMarkets[0]?.title || "Player"} markets={playerMarkets} outcomes={outcomes} selected={selected} disabled={disabled} onToggle={onToggle} />;
        })}
        {!playerIds.length ? <p className="py-4 text-center text-sm text-chalk/40">No markets for Team {team}.</p> : null}
      </div>
    </section>
  );
}

function MarketGroup({ title, markets, outcomes, selected, disabled, onToggle }: { title: string; markets: BettingMarket[]; outcomes: BettingOutcome[]; selected: string[]; disabled: boolean; onToggle: (outcome: BettingOutcome) => void }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <h3 className="mb-3 text-sm font-bold text-chalk">{title}</h3>
      <div className="space-y-2">
        {markets.sort((first, second) => Number(first.line || 0) - Number(second.line || 0)).map(market => {
          const marketOutcomes = outcomes.filter(outcome => outcome.market_id === market.id);
          return (
            <div key={market.id} className={cn("grid items-stretch gap-2", market.line != null ? "grid-cols-[auto_1fr]" : "grid-cols-1")}>
              {market.line != null ? <div className="grid min-w-12 place-items-center rounded-xl border border-white/10 bg-white/5 px-2 font-mono text-sm text-chalk/70">{Number(market.line).toFixed(1)}</div> : null}
              <div className={cn("grid gap-2", marketOutcomes.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {marketOutcomes.map(outcome => {
                  const active = selected.includes(outcome.id);
                  const compactLabel = market.line == null ? outcome.label : outcome.label.split(" ")[0];
                  return <button key={outcome.id} type="button" disabled={disabled} aria-pressed={active} aria-label={`${title}: ${outcome.label}`} onClick={() => onToggle(outcome)} className={cn("min-w-0 rounded-xl border px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50", active ? "border-floodlight/70 bg-floodlight/15 ring-1 ring-floodlight/40" : "border-white/10 bg-white/5 hover:border-perimeter-400/50 hover:bg-perimeter-400/10")}><span className="block truncate text-[11px] text-chalk/60">{compactLabel}</span><span className="mt-0.5 block font-mono text-base font-bold text-chalk">{Number(outcome.offered_odds).toFixed(2)}</span></button>;
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
    <Card className="h-fit xl:sticky xl:top-24">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Ticket size={19} className="text-floodlight" /><h2 className="font-display text-3xl uppercase">Bet slip</h2></div>{outcomes.length > 1 ? <Pill>Builder</Pill> : outcomes.length === 1 ? <Pill>Single</Pill> : null}</div>
      {!outcomes.length ? <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-chalk/50">Choose an outcome to start a slip.</div> : (
        <div className="mt-4 space-y-2">
          {outcomes.map(outcome => {
            const market = markets.find(item => item.id === outcome.market_id);
            return <div key={outcome.id} className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"><div><div className="text-xs text-chalk/50">{market?.title}</div><div className="mt-1 font-semibold">{outcome.label} <span className="ml-1 font-mono text-floodlight">{Number(outcome.offered_odds).toFixed(2)}</span></div></div><button type="button" onClick={() => onRemove(outcome.id)} className="rounded-lg p-1 text-chalk/40 hover:bg-white/5 hover:text-chalk" aria-label={`Remove ${outcome.label}`}><X size={16} /></button></div>;
          })}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-white/5 p-3"><div className="text-[11px] uppercase tracking-wider text-chalk/45">Accepted odds</div><div className="mt-1 font-mono text-xl">{outcomes.length ? odds.toFixed(2) : "—"}</div></div><div className="rounded-2xl bg-white/5 p-3"><div className="text-[11px] uppercase tracking-wider text-chalk/45">Potential return</div><div className="mt-1 text-floodlight">{potentialReturn ? <CoinAmount units={Math.round(potentialReturn * 100)} iconSize={19} className="text-xl" /> : <span className="font-mono text-xl">—</span>}</div></div></div>
      <label className="mt-4 block"><span className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-chalk/50"><span>Stake</span><CoinAmount units={balanceUnits} iconSize={16} /></span><TextInput type="number" min="0.01" step="0.01" inputMode="decimal" value={stake} onChange={event => onStake(event.target.value)} placeholder="Coins" /></label>
      <PrimaryButton type="button" className="mt-3 w-full py-3" disabled={disabled || placing || !outcomes.length || Number(stake) <= 0} onClick={onPlace}>{placing ? "Placing…" : outcomes.length > 1 ? "Place bet builder" : "Place bet"}</PrimaryButton>
      <p className="mt-3 text-center text-xs text-chalk/40">Your available coin balance is the stake limit.</p>
    </Card>
  );
}
