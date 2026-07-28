"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { friendlyActionError } from "@/lib/actionErrors";
import { supabase } from "@/lib/supabase";
import { FantasyPick, FantasySquad, Game, GameLineup, GamePlayerStat, LeagueData, LeagueSettings, MatchEvent, Player, Profile, Season } from "@/lib/types";

const emptyData: LeagueData = {
  profiles: [],
  players: [],
  games: [],
  lineups: [],
  events: [],
  playerStats: [],
  squads: [],
  picks: [],
  seasons: [],
  leagueSettings: null
};

function friendlyDataError(message: string) {
  if (message.includes("schema cache") && message.includes("public.profiles")) {
    return "The Supabase database tables have not been set up yet. Run supabase/schema.sql in your Supabase SQL Editor for the same project used by .env.local, then refresh.";
  }

  return friendlyActionError({ message }, "League data could not be loaded. Check your connection and try again.");
}

function useLeagueDataStore() {
  const [data, setData] = useState<LeagueData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [profiles, players, games, lineups, events, playerStats, squads, picks, seasons, leagueSettings] = await Promise.all([
      supabase.from("profiles").select("*").order("username"),
      supabase.from("players").select("*").order("name"),
      supabase.from("games").select("*").order("game_date", { ascending: false }),
      supabase.from("game_lineups").select("*"),
      supabase.from("events").select("*").order("created_at", { ascending: true }),
      supabase.from("game_player_stats").select("*").order("created_at", { ascending: true }),
      supabase.from("fantasy_squads").select("*"),
      supabase.from("fantasy_picks").select("*").order("slot_index", { ascending: true }),
      supabase.from("seasons").select("*").order("start_date", { ascending: false }),
      supabase.from("league_settings").select("*").eq("id", 1).maybeSingle()
    ]);

    const firstError = [profiles, players, games, lineups, events, playerStats, squads, picks, seasons, leagueSettings].find(r => r.error)?.error;
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
      picks: (picks.data || []) as FantasyPick[],
      seasons: (seasons.data || []) as Season[],
      leagueSettings: (leagueSettings.data || null) as LeagueSettings | null
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const scheduleLoad = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        void load();
      }, 150);
    };
    const channel = supabase
      .channel("league-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_lineups" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_player_stats" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "fantasy_squads" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "fantasy_picks" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "seasons" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_settings" }, scheduleLoad)
      .subscribe();

    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

  return useMemo(() => ({ data, loading, error, reload: load }), [data, loading, error, load]);
}

type LeagueDataState = ReturnType<typeof useLeagueDataStore>;
const LeagueDataContext = createContext<LeagueDataState | null>(null);

export function LeagueDataProvider({ children }: { children: ReactNode }) {
  const value = useLeagueDataStore();
  return createElement(LeagueDataContext.Provider, { value }, children);
}

export function useLeagueData() {
  const value = useContext(LeagueDataContext);
  if (!value) throw new Error("useLeagueData must be used inside LeagueDataProvider.");
  return value;
}
