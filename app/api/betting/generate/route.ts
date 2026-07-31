import { NextResponse } from "next/server";
import { BETTING_MODEL_VERSION, generatePlayerLineupMarkets } from "@/lib/betting";
import { serverRateLimitDecision } from "@/lib/serverRateLimit";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  Game,
  GameLineup,
  GamePlayerStat,
  LeagueData,
  LeagueSettings,
  MatchEvent,
  Player,
  Season
} from "@/lib/types";

export const runtime = "nodejs";

type RequestBody = {
  gameId?: unknown;
};

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = authorization.slice("Bearer ".length);
  const admin = createSupabaseAdmin();
  const {
    data: { user },
    error: authError
  } = await admin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid authentication." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  if (!gameId) {
    return NextResponse.json({ error: "A game is required." }, { status: 400 });
  }

  const { data: game, error: gameError } = await admin
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (gameError || !game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const [{ data: membership }, { data: profile }] = await Promise.all([
    admin
      .from("league_memberships")
      .select("role, status")
      .eq("league_id", game.league_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("account_status")
      .eq("id", user.id)
      .single()
  ]);
  if (
    profile?.account_status !== "active"
    || membership?.status !== "active"
    || !["owner", "admin"].includes(membership.role)
  ) {
    return NextResponse.json({ error: "League admin access required." }, { status: 403 });
  }

  const limit = await serverRateLimitDecision({
    scope: `betting-auto-generate:${game.league_id}`,
    identifier: user.id,
    maximumAttempts: 10,
    windowSeconds: 60
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.error }, { status: limit.status });
  }

  const [
    leagueResult,
    settingsResult,
    playersResult,
    gamesResult,
    lineupsResult,
    eventsResult,
    statsResult,
    seasonsResult,
    leagueSettingsResult
  ] = await Promise.all([
    admin.from("leagues").select("betting_enabled, betting_unlock_after_games, status").eq("id", game.league_id).single(),
    admin.from("betting_settings").select("single_margin").eq("league_id", game.league_id).single(),
    admin.from("players").select("*").eq("league_id", game.league_id),
    admin.from("games").select("*").eq("league_id", game.league_id),
    admin.from("game_lineups").select("*").eq("league_id", game.league_id),
    admin.from("events").select("*").eq("league_id", game.league_id),
    admin.from("game_player_stats").select("*").eq("league_id", game.league_id),
    admin.from("seasons").select("*").eq("league_id", game.league_id),
    admin.from("league_settings").select("*").eq("league_id", game.league_id).maybeSingle()
  ]);

  const queryError = [
    leagueResult.error,
    settingsResult.error,
    playersResult.error,
    gamesResult.error,
    lineupsResult.error,
    eventsResult.error,
    statsResult.error,
    seasonsResult.error,
    leagueSettingsResult.error
  ].find(Boolean);
  if (queryError) {
    console.error("Automatic market data load failed", {
      gameId,
      leagueId: game.league_id,
      message: queryError.message
    });
    return NextResponse.json(
      { error: "The lineup was saved, but betting could not be prepared." },
      { status: 500 }
    );
  }

  const league = leagueResult.data;
  const finalGames = (gamesResult.data || []).filter(row => row.status === "final").length;
  if (
    !league?.betting_enabled
    || league.status !== "active"
    || finalGames < Number(league.betting_unlock_after_games)
  ) {
    return NextResponse.json({
      generated: false,
      reason: !league?.betting_enabled ? "betting_disabled" : "cold_start",
      completed_games: finalGames,
      required_games: Number(league?.betting_unlock_after_games || 0),
      remaining_games: Math.max(Number(league?.betting_unlock_after_games || 0) - finalGames, 0)
    });
  }

  const data: LeagueData = {
    profiles: [],
    players: (playersResult.data || []) as Player[],
    games: (gamesResult.data || []) as Game[],
    lineups: (lineupsResult.data || []) as GameLineup[],
    events: (eventsResult.data || []) as MatchEvent[],
    playerStats: (statsResult.data || []) as GamePlayerStat[],
    squads: [],
    picks: [],
    seasons: (seasonsResult.data || []) as Season[],
    leagueSettings: (leagueSettingsResult.data || null) as LeagueSettings | null
  };

  try {
    const generated = generatePlayerLineupMarkets(
      data,
      game as Game,
      Number(settingsResult.data?.single_margin ?? 0.06)
    );
    const { data: result, error } = await admin.rpc(
      "system_generate_league_betting_markets",
      {
        target_game_id: gameId,
        target_actor_id: user.id,
        target_model_version: BETTING_MODEL_VERSION,
        target_input_snapshot: generated.snapshot,
        submitted_markets: generated.markets
      }
    );
    if (error) throw error;
    return NextResponse.json(result);
  } catch (error) {
    console.error("Automatic market generation failed", {
      gameId,
      leagueId: game.league_id,
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { error: "The lineup was saved, but automatic betting setup failed." },
      { status: 500 }
    );
  }
}
