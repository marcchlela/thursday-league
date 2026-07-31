"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLeagueContext } from "@/hooks/useLeagueContext";

export function useHomeBetStatus(userId?: string, gameId?: string) {
  const { league } = useLeagueContext();
  const [hasBet, setHasBet] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !gameId || !league) {
      setHasBet(false);
      return;
    }

    const { data, error } = await supabase
      .from("bet_slips")
      .select("id")
      .eq("user_id", userId)
      .eq("league_id", league.id)
      .eq("game_id", gameId)
      .neq("status", "cashed_out")
      .limit(1);

    setHasBet(!error && !!data?.length);
  }, [gameId, league, userId]);

  useEffect(() => {
    void load();
    if (!userId || !league) return;

    const channel = supabase
      .channel(`home-bet-status-${league.id}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_slips", filter: `league_id=eq.${league.id}` }, load)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [league, load, userId]);

  return hasBet;
}
