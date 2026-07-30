import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { calculateScore } from "@/lib/scoring";
import { GameLineup, GamePlayerStat, MatchEvent } from "@/lib/types";
import {
  NotificationType,
  PushPayload,
  sendTrackedPush
} from "@/lib/pushNotifications";
import { serverRateLimitDecision } from "@/lib/serverRateLimit";
import {
  gameNotificationPayload,
  LeagueGameNotificationEvent
} from "@/lib/leagueNotifications";

export const runtime = "nodejs";

type AdminEvent = LeagueGameNotificationEvent;

type RequestBody = {
  gameId?: unknown;
  event?: unknown;
};

function notificationType(event: AdminEvent): NotificationType {
  if (event === "game_scheduled") return "new_game";
  if (event === "lineups_ready") return "lineups_ready";
  return "final_results";
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const token = authorization.slice("Bearer ".length);
  const supabaseAdmin = createSupabaseAdmin();

  const {
    data: { user },
    error: authError
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { error: "Invalid authentication." },
      { status: 401 }
    );
  }

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("profiles")
      .select("account_status")
      .eq("id", user.id)
      .single();

  if (profileError || profile?.account_status !== "active") {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }

  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const gameId =
    typeof body.gameId === "string" ? body.gameId : "";

  const event = body.event;

  if (
    !gameId ||
    (
      event !== "game_scheduled" &&
      event !== "lineups_ready" &&
      event !== "result_finalized"
    )
  ) {
    return NextResponse.json(
      { error: "Invalid game notification event." },
      { status: 400 }
    );
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id, league_id, game_date, status, finalized_at")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    return NextResponse.json(
      { error: "Game not found." },
      { status: 404 }
    );
  }

  const [{ data: membership }, { data: league }] = await Promise.all([
    supabaseAdmin
      .from("league_memberships")
      .select("role, status")
      .eq("league_id", game.league_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabaseAdmin
      .from("leagues")
      .select("name, slug, betting_enabled, betting_unlock_after_games")
      .eq("id", game.league_id)
      .single()
  ]);
  if (
    membership?.status !== "active"
    || !["owner", "admin"].includes(membership.role)
    || !league
  ) {
    return NextResponse.json({ error: "League admin access required." }, { status: 403 });
  }

  const limit = await serverRateLimitDecision({
    scope: `push-league-event:${game.league_id}`,
    identifier: user.id,
    maximumAttempts: 10,
    windowSeconds: 60
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.error }, { status: limit.status });
  }

  let score: { A: number; B: number } | undefined;
  if (event === "result_finalized") {
    const [eventsResult, lineupsResult, statsResult] = await Promise.all([
      supabaseAdmin.from("events").select("*").eq("league_id", game.league_id).eq("game_id", game.id),
      supabaseAdmin.from("game_lineups").select("*").eq("league_id", game.league_id).eq("game_id", game.id),
      supabaseAdmin.from("game_player_stats").select("*").eq("league_id", game.league_id).eq("game_id", game.id)
    ]);

    if (eventsResult.error || lineupsResult.error || statsResult.error) {
      return NextResponse.json(
        { error: "Could not calculate the final score." },
        { status: 500 }
      );
    }

    score = calculateScore(
      (eventsResult.data || []) as MatchEvent[],
      (lineupsResult.data || []) as GameLineup[],
      (statsResult.data || []) as GamePlayerStat[]
    );
  }

  const payload: PushPayload | null = gameNotificationPayload(
    event,
    game,
    league.slug,
    score
  );

  if (!payload) {
    return NextResponse.json(
      { error: "The game is not in the correct state for this notification." },
      { status: 409 }
    );
  }

  let result;
  let bettingUnlockResult;
  try {
    const finalVersion = event === "result_finalized" ? game.finalized_at || "final" : "first";
    result = await sendTrackedPush({
      leagueId: game.league_id,
      type: notificationType(event),
      payload,
      gameId: game.id,
      createdBy: user.id,
      dedupeKey: `${event}:${game.id}:${finalVersion}`
    });

    if (
      event === "result_finalized"
      && league.betting_enabled
      && Number(league.betting_unlock_after_games) > 0
    ) {
      const { count: completedGames, error: countError } = await supabaseAdmin
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("league_id", game.league_id)
        .eq("status", "final");
      if (countError) throw countError;
      const requiredGames = Number(league.betting_unlock_after_games);
      if (Number(completedGames || 0) >= requiredGames) {
        bettingUnlockResult = await sendTrackedPush({
          leagueId: game.league_id,
          type: "betting_unlocked",
          source: "scheduled",
          gameId: game.id,
          createdBy: user.id,
          dedupeKey: `betting_unlocked:${game.league_id}:${requiredGames}`,
          payload: {
            title: "Betting unlocked",
            body: `${requiredGames} games are complete. Virtual betting is now open in ${league.name}.`,
            url: `/l/${league.slug}/betting?tab=markets`,
            tag: `betting-unlocked-${game.league_id}`,
            ttl: 86400
          }
        });
      }
    }
  } catch (error) {
    console.error("Admin game notification failed", error);
    return NextResponse.json(
      { error: "The automatic notification could not be completed right now." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    result,
    bettingUnlockResult
  });
}
