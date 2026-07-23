"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useHomeBetStatus(userId?: string, gameId?: string) {
  const [hasBet, setHasBet] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !gameId) {
      setHasBet(false);
      return;
    }

    const { data, error } = await supabase
      .from("bet_slips")
      .select("id")
      .eq("user_id", userId)
      .eq("game_id", gameId)
      .neq("status", "cashed_out")
      .limit(1);

    setHasBet(!error && !!data?.length);
  }, [gameId, userId]);

  useEffect(() => {
    void load();
    if (!userId) return;

    const channel = supabase
      .channel(`home-bet-status-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_slips", filter: `user_id=eq.${userId}` }, load)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [load, userId]);

  return hasBet;
}
