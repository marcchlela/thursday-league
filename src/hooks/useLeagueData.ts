"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FantasyPick, FantasySquad, Game, GameLineup, GamePlayerStat, LeagueData, MatchEvent, Player, Profile } from "@/lib/types";

const emptyData: LeagueData = {
  profiles: [],
  players: [],
  games: [],
  lineups: [],
  events: [],
  playerStats: [],
  squads: [],
  picks: []
};

function friendlyDataError(message: string) {
  if (message.includes("schema cache") && message.includes("public.profiles")) {
    return "The Supabase database tables have not been set up yet. Run supabase/schema.sql in your Supabase SQL Editor for the same project used by .env.local, then refresh.";
  }

  return message;
}

export function useLeagueData() {
  const [data, setData] = useState<LeagueData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [profiles, players, games, lineups, events, playerStats, squads, picks] = await Promise.all([
      supabase.from("profiles").select("*").order("username"),
      supabase.from("players").select("*").order("name"),
      supabase.from("games").select("*").order("game_date", { ascending: false }),
      supabase.from("game_lineups").select("*"),
      supabase.from("events").select("*").order("created_at", { ascending: true }),
      supabase.from("game_player_stats").select("*").order("created_at", { ascending: true }),
      supabase.from("fantasy_squads").select("*"),
      supabase.from("fantasy_picks").select("*").order("slot_index", { ascending: true })
    ]);

    const firstError = [profiles, players, games, lineups, events, playerStats, squads, picks].find(r => r.error)?.error;
    if (firstError) {
      setError(friendlyDataError(firstError.message));
      setLoading(false);
      return;
    }

    setData({
      profiles: (profiles.data || []) as Profile[],
      players: (players.data || []) as Player[],
      games: (games.data || []) as Game[],
      lineups: (lineups.data || []) as GameLineup[],
      events: (events.data || []) as MatchEvent[],
      playerStats: (playerStats.data || []) as GamePlayerStat[],
      squads: (squads.data || []) as FantasySquad[],
      picks: (picks.data || []) as FantasyPick[]
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("league-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_lineups" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_player_stats" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "fantasy_squads" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "fantasy_picks" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { data, loading, error, reload: load };
}
