"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BettingStanding, PublicBetSlip } from "@/lib/types";

export function useBettingSocial(gameId: string, seasonId: string, enabled: boolean, gameStatus?: string) {
  const [standings, setStandings] = useState<BettingStanding[]>([]);
  const [slips, setSlips] = useState<PublicBetSlip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousGameStatus = useRef(gameStatus);

  const load = useCallback(async () => {
    if (!enabled || !seasonId) return;
    setLoading(true);
    setError(null);
    const standingsResult = await supabase.rpc("get_betting_standings", { target_season_id: seasonId });
    const slipsResult = gameId
      ? await supabase.rpc("get_public_bet_slips", { target_game_id: gameId })
      : { data: [], error: null };
    const firstError = standingsResult.error || slipsResult.error;
    if (firstError) {
      setError(`${firstError.message} Apply the expanded betting migration in Supabase if needed.`);
    } else {
      setStandings((standingsResult.data || []) as BettingStanding[]);
      setSlips((slipsResult.data || []) as PublicBetSlip[]);
    }
    setLoading(false);
  }, [enabled, gameId, seasonId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (previousGameStatus.current === gameStatus) return;
    previousGameStatus.current = gameStatus;
    void load();
  }, [gameStatus, load]);
  return { standings, slips, loading, error, reload: load };
}
