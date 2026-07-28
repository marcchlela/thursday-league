"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BettingStanding } from "@/lib/types";
import { friendlyActionError } from "@/lib/actionErrors";

export function useBettingSocial(seasonId: string, enabled: boolean, gameStatus?: string) {
  const [standings, setStandings] = useState<BettingStanding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousGameStatus = useRef(gameStatus);

  const load = useCallback(async () => {
    if (!enabled || !seasonId) return;
    setLoading(true);
    setError(null);
    const standingsResult = await supabase.rpc("get_betting_standings", { target_season_id: seasonId });
    if (standingsResult.error) {
      setError(friendlyActionError(standingsResult.error, "Betting standings could not be loaded. Please try again."));
    } else {
      setStandings((standingsResult.data || []) as BettingStanding[]);
    }
    setLoading(false);
  }, [enabled, seasonId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (previousGameStatus.current === gameStatus) return;
    previousGameStatus.current = gameStatus;
    void load();
  }, [gameStatus, load]);
  return { standings, loading, error, reload: load };
}
