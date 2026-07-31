"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { friendlyActionError } from "@/lib/actionErrors";
import { describeLoadProblem, withLoadTimeout } from "@/lib/loadProblems";
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
  const fallback = friendlyActionError({ message }, "League data could not be loaded. Check your connection and try again.");
  return describeLoadProblem({ message }, fallback).message;
}

function useLeagueDataStore(leagueId: string) {
  const [data, setData] = useState<LeagueData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let results;
    try {
      results = await withLoadTimeout(Promise.all([
        supabase.rpc("get_league_member_directory", { target_league_id: leagueId }),
        supabase.from("players").select("*").eq("league_id", leagueId).order("name"),
        supabase.from("games").select("*").eq("league_id", leagueId).order("game_date", { ascending: false }),
        supabase.from("game_lineups").select("*").eq("league_id", leagueId),
        supabase.from("events").select("*").eq("league_id", leagueId).order("created_at", { ascending: true }),
        supabase.from("game_player_stats").select("*").eq("league_id", leagueId).order("created_at", { ascending: true }),
        supabase.from("fantasy_squads").select("*").eq("league_id", leagueId),
        supabase.from("fantasy_picks").select("*").eq("league_id", leagueId).order("slot_index", { ascending: true }),
        supabase.from("seasons").select("*").eq("league_id", leagueId).order("start_date", { ascending: false }),
        supabase.from("league_settings").select("*").eq("league_id", leagueId).maybeSingle()
      ]));
    } catch (loadError) {
      setError(describeLoadProblem(loadError).message);
      setLoading(false);
      return;
    }
    const [profiles, players, games, lineups, events, playerStats, squads, picks, seasons, leagueSettings] = results;

    const firstError = [profiles, players, games, lineups, events, playerStats, squads, picks, seasons, leagueSettings].find(r => r.error)?.error;
    if (firstError) {
      setError(friendlyDataError(firstError.message));
      setLoading(false);
      return;
    }

    setData({
      profiles: (profiles.data || []).map((profile: { id: string; username: string; avatar_path: string | null }) => ({
        ...profile,
        is_admin: false
      })) as Profile[],
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
  }, [leagueId]);

  useEffect(() => {
    setData(emptyData);
    setLoading(true);
    load();
    const scheduleLoad = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        void load();
      }, 150);
    };
    const channel = supabase
      .channel(`league-data-${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_lineups", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_player_stats", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "fantasy_squads", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "fantasy_picks", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "seasons", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_settings", filter: `league_id=eq.${leagueId}` }, scheduleLoad)
      .subscribe();

    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [leagueId, load]);

  return useMemo(() => ({ data, loading, error, reload: load }), [data, loading, error, load]);
}

type LeagueDataState = ReturnType<typeof useLeagueDataStore>;
const LeagueDataContext = createContext<LeagueDataState | null>(null);

export function LeagueDataProvider({ children, leagueId }: { children: ReactNode; leagueId: string }) {
  const value = useLeagueDataStore(leagueId);
  return createElement(LeagueDataContext.Provider, { value }, children);
}

export function useLeagueData() {
  const value = useContext(LeagueDataContext);
  if (!value) throw new Error("useLeagueData must be used inside LeagueDataProvider.");
  return value;
}
