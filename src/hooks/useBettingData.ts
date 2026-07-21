"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BetLeg,
  BetSettlementRun,
  BetSlip,
  BettingData,
  BettingMarket,
  BettingOutcome,
  BettingSettings,
  BettingWallet,
  CoinLedgerEntry,
  GameResultVersion,
  OddsGenerationRun
} from "@/lib/types";

const emptyData: BettingData = {
  settings: null,
  generations: [],
  markets: [],
  outcomes: [],
  wallets: [],
  slips: [],
  legs: [],
  ledger: [],
  resultVersions: [],
  settlementRuns: []
};

export function useBettingData() {
  const [data, setData] = useState<BettingData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [settings, generations, markets, outcomes, wallets, slips, legs, ledger, resultVersions, settlementRuns] = await Promise.all([
      supabase.from("betting_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("odds_generation_runs").select("*").order("created_at", { ascending: false }),
      supabase.from("betting_markets").select("*").order("created_at", { ascending: true }),
      supabase.from("betting_outcomes").select("*").order("created_at", { ascending: true }),
      supabase.from("betting_wallets").select("*").order("created_at", { ascending: false }),
      supabase.from("bet_slips").select("*").order("placed_at", { ascending: false }),
      supabase.from("bet_legs").select("*").order("created_at", { ascending: true }),
      supabase.from("coin_ledger").select("*").order("created_at", { ascending: false }),
      supabase.from("game_result_versions").select("*").order("created_at", { ascending: false }),
      supabase.from("bet_settlement_runs").select("*").order("created_at", { ascending: false })
    ]);
    const responses = [settings, generations, markets, outcomes, wallets, slips, legs, ledger, resultVersions, settlementRuns];
    const firstError = responses.find(response => response.error)?.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setData({
      settings: (settings.data || null) as BettingSettings | null,
      generations: (generations.data || []) as OddsGenerationRun[],
      markets: (markets.data || []) as BettingMarket[],
      outcomes: (outcomes.data || []) as BettingOutcome[],
      wallets: (wallets.data || []) as BettingWallet[],
      slips: (slips.data || []) as BetSlip[],
      legs: (legs.data || []) as BetLeg[],
      ledger: (ledger.data || []) as CoinLedgerEntry[],
      resultVersions: (resultVersions.data || []) as GameResultVersion[],
      settlementRuns: (settlementRuns.data || []) as BetSettlementRun[]
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("betting-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "betting_markets" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "betting_outcomes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "betting_wallets" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_slips" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_legs" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "coin_ledger" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_result_versions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_settlement_runs" }, load)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  return { data, loading, error, reload: load };
}
