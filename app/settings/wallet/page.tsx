"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Gift, HandCoins, RefreshCw, Ticket, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLeagueData } from "@/hooks/useLeagueData";
import { supabase } from "@/lib/supabase";
import { BettingWallet, CoinLedgerEntry } from "@/lib/types";
import { cn, currentSeason, formatDateTime } from "@/lib/utils";
import { CoinAmount, LeagueCoin } from "@/components/LeagueCoin";
import { SettingsHeader, SettingsPanel } from "@/components/SettingsComponents";
import { EmptyState, ErrorState, LoadingState, Select } from "@/components/ui";

export default function WalletHistoryPage() {
  const { user, loading: authLoading } = useAuthProfile();
  const league = useLeagueData();
  const [wallets, setWallets] = useState<BettingWallet[]>([]);
  const [entries, setEntries] = useState<CoinLedgerEntry[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const walletsResult = await supabase
      .from("betting_wallets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (walletsResult.error) {
      setError(walletsResult.error.message);
      setLoading(false);
      return;
    }

    const ownWallets = (walletsResult.data || []) as BettingWallet[];
    const walletIds = ownWallets.map(wallet => wallet.id);
    const ledgerResult = walletIds.length
      ? await supabase.from("coin_ledger").select("*").in("wallet_id", walletIds).order("created_at", { ascending: false })
      : { data: [], error: null };

    if (ledgerResult.error) {
      setError(ledgerResult.error.message);
    } else {
      setWallets(ownWallets);
      setEntries((ledgerResult.data || []) as CoinLedgerEntry[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const preferredSeason = useMemo(() => currentSeason(league.data), [league.data]);
  useEffect(() => {
    if (selectedSeasonId && league.data.seasons.some(season => season.id === selectedSeasonId)) return;
    setSelectedSeasonId(preferredSeason?.id || league.data.seasons[0]?.id || "");
  }, [league.data.seasons, preferredSeason?.id, selectedSeasonId]);

  if (authLoading || league.loading || loading) return <LoadingState label="Loading wallet history" cards={3} />;
  if (league.error) return <ErrorState message={league.error} onRetry={league.reload} />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!user) return null;

  const wallet = wallets.find(item => item.season_id === selectedSeasonId);
  const seasonEntries = wallet ? entries.filter(entry => entry.wallet_id === wallet.id) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SettingsHeader title="Wallet history" description="Review every virtual-coin movement in your betting wallet." />

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[1.35rem] border border-league-gold/25 bg-ink-850 p-4 shadow-[0_9px_24px_rgba(0,0,0,.13)] sm:p-5">
        <div className="flex items-center gap-3">
          <LeagueCoin size={46} />
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/60">Available balance</div>
            <CoinAmount units={Number(wallet?.balance_units || 0)} iconSize={0} className="mt-0.5 text-3xl font-black text-league-gold" />
          </div>
        </div>
        <Select value={selectedSeasonId} onChange={event => setSelectedSeasonId(event.target.value)} className="w-full rounded-xl border-league-gold/15 py-2 text-sm sm:w-52" aria-label="Wallet season">
          {league.data.seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}
        </Select>
      </section>

      <SettingsPanel title="Transactions">
        {!seasonEntries.length ? (
          <div className="p-3 sm:p-4"><EmptyState title="No transactions" text="Coin grants, placed bets, cash-outs, payouts, and corrections will appear here." /></div>
        ) : (
          <ol className="divide-y divide-league-gold/10">
            {seasonEntries.map(entry => <WalletEntry key={entry.id} entry={entry} gameDate={gameDateForEntry(entry, league.data.games)} />)}
          </ol>
        )}
      </SettingsPanel>
    </div>
  );
}

function gameDateForEntry(entry: CoinLedgerEntry, games: ReturnType<typeof useLeagueData>["data"]["games"]) {
  const gameId = typeof entry.metadata?.game_id === "string" ? entry.metadata.game_id : null;
  return gameId ? games.find(game => game.id === gameId)?.game_date : undefined;
}

function WalletEntry({ entry, gameDate }: { entry: CoinLedgerEntry; gameDate?: string }) {
  const content = transactionContent(entry.entry_type);
  const Icon = content.icon;
  const positive = Number(entry.amount_units) > 0;
  const reason = typeof entry.metadata?.reason === "string" ? entry.metadata.reason : null;

  return (
    <li className="flex items-center gap-3 px-4 py-4 sm:px-5">
      <span className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
        positive ? "border-turf-400/20 bg-turf-400/[.045] text-turf-400" : "border-red-400/20 bg-red-400/[.045] text-red-300"
      )}>
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{content.title}</div>
        <div className="mt-0.5 truncate text-[10px] text-chalk/32">
          {gameDate ? `${formatDateTime(gameDate)} · ` : ""}{new Date(entry.created_at).toLocaleString()}
        </div>
        {reason ? <div className="mt-1 text-xs text-chalk/45">{reason}</div> : null}
      </div>
      <div className="shrink-0 text-right">
        <CoinAmount units={Number(entry.amount_units)} iconSize={14} className={cn("font-semibold", positive ? "text-turf-400" : "text-red-300")} />
        <div className="mt-1 text-[9px] text-chalk/30">Balance {formatBalance(entry.balance_after_units)}</div>
      </div>
    </li>
  );
}

function transactionContent(entryType: CoinLedgerEntry["entry_type"]): { title: string; icon: LucideIcon } {
  if (entryType === "initial_grant") return { title: "Starting balance", icon: Gift };
  if (entryType === "stake") return { title: "Bet placed", icon: Ticket };
  if (entryType === "cashout") return { title: "Bet cashed out", icon: HandCoins };
  if (entryType === "payout") return { title: "Bet payout", icon: Trophy };
  if (entryType === "admin_adjustment") return { title: "Admin balance adjustment", icon: CircleDollarSign };
  return { title: "Settlement correction", icon: RefreshCw };
}

function formatBalance(units: number) {
  return (Number(units) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
