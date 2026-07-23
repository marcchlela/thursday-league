"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentSeason } from "@/lib/utils";
import { LeagueSettings, Season } from "@/lib/types";

export function useCoinBalance(userId?: string) {
  const [balanceUnits, setBalanceUnits] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setBalanceUnits(null);
      return;
    }

    const [seasonsResult, settingsResult] = await Promise.all([
      supabase.from("seasons").select("*").order("start_date", { ascending: false }),
      supabase.from("league_settings").select("*").eq("id", 1).maybeSingle()
    ]);

    if (seasonsResult.error || settingsResult.error) {
      setBalanceUnits(null);
      return;
    }

    const season = currentSeason({
      seasons: (seasonsResult.data || []) as Season[],
      leagueSettings: (settingsResult.data || null) as LeagueSettings | null
    });

    if (!season) {
      setBalanceUnits(null);
      return;
    }

    const { data, error } = await supabase
      .from("betting_wallets")
      .select("balance_units")
      .eq("user_id", userId)
      .eq("season_id", season.id)
      .maybeSingle();

    setBalanceUnits(error ? null : Number(data?.balance_units ?? 0));
  }, [userId]);

  useEffect(() => {
    void load();
    if (!userId) return;

    const channel = supabase
      .channel(`app-balance-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "betting_wallets", filter: `user_id=eq.${userId}` }, load)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [load, userId]);

  return balanceUnits;
}
