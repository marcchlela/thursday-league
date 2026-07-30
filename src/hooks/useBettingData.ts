"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyActionError } from "@/lib/actionErrors";
import { useLeagueContext } from "@/hooks/useLeagueContext";
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
  const { league } = useLeagueContext();
  const leagueId = league?.id;
  const [data, setData] = useState<BettingData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!leagueId) {
      setData(emptyData);
      setLoading(false);
      return;
    }
    setError(null);
    const [settings, generations, markets, outcomes, wallets, slips, legs, ledger, resultVersions, settlementRuns] = await Promise.all([
      supabase
        .rpc("get_league_betting_public_settings", { target_league_id: leagueId })
        .maybeSingle(),
      supabase.from("odds_generation_runs").select("*").eq("league_id", leagueId).order("created_at", { ascending: false }),
      supabase.from("betting_markets").select("*").eq("league_id", leagueId).order("created_at", { ascending: true }),
      supabase.from("betting_outcomes").select("*").eq("league_id", leagueId).order("created_at", { ascending: true }),
      supabase.from("betting_wallets").select("*").eq("league_id", leagueId).order("created_at", { ascending: false }),
      supabase.from("bet_slips").select("*").eq("league_id", leagueId).order("placed_at", { ascending: false }),
      supabase.from("bet_legs").select("*").eq("league_id", leagueId).order("created_at", { ascending: true }),
      supabase.from("coin_ledger").select("*").eq("league_id", leagueId).order("created_at", { ascending: false }),
      supabase.from("game_result_versions").select("*").eq("league_id", leagueId).order("created_at", { ascending: false }),
      supabase.from("bet_settlement_runs").select("*").eq("league_id", leagueId).order("created_at", { ascending: false })
    ]);
    const responses = [settings, generations, markets, outcomes, wallets, slips, legs, ledger, resultVersions, settlementRuns];
    const firstError = responses.find(response => response.error)?.error;
    if (firstError) {
      setError(friendlyActionError(firstError, "Betting data could not be loaded. Check your connection and try again."));
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
  }, [leagueId]);

  useEffect(() => {
    setData(emptyData);
    setLoading(true);
    load();
    if (!leagueId) return;
    const scheduleLoad = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        void load();
      }, 150);
    };
    const channel = supabase
      .channel(`betting-data-${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "betting_markets", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "betting_outcomes", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "betting_wallets", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_slips", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_legs", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "coin_ledger", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_result_versions", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_settlement_runs", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [leagueId, load]);

  return { data, loading, error, reload: load };
}
