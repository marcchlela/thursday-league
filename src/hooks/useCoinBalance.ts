"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentSeason } from "@/lib/utils";
import { LeagueSettings, Season } from "@/lib/types";

export function useCoinBalance(userId?: string, leagueId?: string) {
  const [balanceState, setBalanceState] = useState<{
    leagueId?: string;
    units: number | null;
  }>({ leagueId, units: null });

  const load = useCallback(async () => {
    if (!userId || !leagueId) {
      setBalanceState({ leagueId, units: null });
      return;
    }

    const [seasonsResult, settingsResult] = await Promise.all([
      supabase.from("seasons").select("*").eq("league_id", leagueId).order("start_date", { ascending: false }),
      supabase.from("league_settings").select("*").eq("league_id", leagueId).maybeSingle()
    ]);

    if (seasonsResult.error || settingsResult.error) {
      setBalanceState({ leagueId, units: null });
      return;
    }

    const season = currentSeason({
      seasons: (seasonsResult.data || []) as Season[],
      leagueSettings: (settingsResult.data || null) as LeagueSettings | null
    });

    if (!season) {
      setBalanceState({ leagueId, units: null });
      return;
    }

    const { data, error } = await supabase
      .from("betting_wallets")
      .select("balance_units")
      .eq("user_id", userId)
      .eq("league_id", leagueId)
      .eq("season_id", season.id)
      .maybeSingle();

    setBalanceState({
      leagueId,
      units: error ? null : Number(data?.balance_units ?? 0)
    });
  }, [leagueId, userId]);

  useEffect(() => {
    void load();
    if (!userId || !leagueId) return;

    const channel = supabase
      .channel(`app-balance-${leagueId}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "betting_wallets", filter: `league_id=eq.${leagueId}` }, load)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [leagueId, load, userId]);

  return balanceState.leagueId === leagueId ? balanceState.units : null;
}
