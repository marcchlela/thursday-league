import { NextResponse } from "next/server";
import { reconcileNativePushReceipts, retryFailedCustomDispatches, sendTrackedPush } from "@/lib/pushNotifications";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { automaticNotificationPayload, loadAutomaticNotificationTemplate } from "@/lib/notificationTemplateServer";
import { isMatchdayMorning } from "@/lib/scheduledNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderPreference = {
  league_id: string;
  user_id: string;
  fantasy_deadline: boolean;
  fantasy_reminder_minutes: number;
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const now = new Date();
  const latestGameTime = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const [gamesResult, preferencesResult, leaguesResult] = await Promise.all([
    supabaseAdmin
      .from("games")
      .select("id, league_id, game_date, status")
      .in("status", ["upcoming", "draft"])
      .gt("game_date", now.toISOString())
      .lte("game_date", latestGameTime),
    supabaseAdmin
      .from("notification_preferences")
      .select("league_id, user_id, fantasy_deadline, fantasy_reminder_minutes")
      .eq("fantasy_deadline", true),
    supabaseAdmin
      .from("leagues")
      .select("id, name, slug, timezone, fantasy_enabled")
      .eq("status", "active")
  ]);

  if (gamesResult.error || preferencesResult.error || leaguesResult.error) {
    return NextResponse.json({ error: "Could not load reminder candidates." }, { status: 500 });
  }

  const preferences = (preferencesResult.data || []) as ReminderPreference[];
  const leagues = new Map((leaguesResult.data || []).map(league => [league.id, league]));
  const [matchdayTemplate, fantasyTemplate] = await Promise.all([
    loadAutomaticNotificationTemplate("matchday_reminder"),
    loadAutomaticNotificationTemplate("fantasy_deadline")
  ]);
  const fantasyResults = [];
  const matchdayResults = [];

  for (const game of gamesResult.data || []) {
    const league = leagues.get(game.league_id);
    if (!league) continue;
    const gameTime = new Date(game.game_date);
    const gameTimeMs = gameTime.getTime();

    if (isMatchdayMorning(now, gameTime, league.timezone || "UTC")) {
      try {
        const payload = await automaticNotificationPayload({
          notificationType: "matchday_reminder",
          template: matchdayTemplate,
          values: { league_name: league.name },
          leagueSlug: league.slug,
          gameId: game.id,
          tag: `matchday-${game.id}`,
          ttl: Math.max(Math.floor((gameTimeMs - now.getTime()) / 1000), 60)
        });
        if (payload) {
          const result = await sendTrackedPush({
            leagueId: game.league_id,
            type: "matchday_reminder",
            gameId: game.id,
            source: "scheduled",
            dedupeKey: `matchday_reminder:${game.id}`,
            payload
          });
          matchdayResults.push({ gameId: game.id, ...result });
        }
      } catch (error) {
        console.error("Matchday reminder delivery failed", { gameId: game.id, error });
        matchdayResults.push({ gameId: game.id, error: "Reminder delivery failed." });
      }
    }

    if (!league.fantasy_enabled || game.status !== "draft") continue;
    const leaguePreferences = preferences.filter(preference => preference.league_id === game.league_id);
    const { data: squads, error: squadsError } = await supabaseAdmin
      .from("fantasy_squads")
      .select("user_id")
      .eq("league_id", game.league_id)
      .eq("game_id", game.id);
    if (squadsError) continue;
    const pickedUsers = new Set((squads || []).map(squad => squad.user_id));
    const reminderMinutes = [...new Set(leaguePreferences.map(preference => preference.fantasy_reminder_minutes))];

    for (const minutes of reminderMinutes) {
      const reminderAt = gameTimeMs - minutes * 60 * 1000;
      if (now.getTime() < reminderAt || now.getTime() >= gameTimeMs) continue;
      const userIds = leaguePreferences
        .filter(preference => preference.fantasy_reminder_minutes === minutes && !pickedUsers.has(preference.user_id))
        .map(preference => preference.user_id);

      try {
        const payload = await automaticNotificationPayload({
          notificationType: "fantasy_deadline",
          template: fantasyTemplate,
          values: { league_name: league.name },
          leagueSlug: league.slug,
          gameId: game.id,
          tag: `fantasy-deadline-${game.id}`,
          ttl: Math.max(Math.floor((gameTimeMs - now.getTime()) / 1000), 60)
        });
        if (payload) {
          const result = await sendTrackedPush({
            leagueId: game.league_id,
            type: "fantasy_deadline",
            gameId: game.id,
            source: "scheduled",
            dedupeKey: `fantasy_deadline:${game.id}:${minutes}`,
            targetUserIds: userIds,
            payload
          });
          fantasyResults.push({ gameId: game.id, minutes, ...result });
        }
      } catch (error) {
        console.error("Fantasy reminder delivery failed", { gameId: game.id, minutes, error });
        fantasyResults.push({ gameId: game.id, minutes, error: "Reminder delivery failed." });
      }
    }
  }

  let automaticRetries: Awaited<ReturnType<typeof retryFailedCustomDispatches>> = [];
  try {
    automaticRetries = await retryFailedCustomDispatches(now);
  } catch (error) {
    console.error("Automatic custom notification recovery failed", error);
  }

  let nativeReceipts: Awaited<ReturnType<typeof reconcileNativePushReceipts>> | null = null;
  try {
    nativeReceipts = await reconcileNativePushReceipts(now);
  } catch (error) {
    console.error("Native push receipt reconciliation failed", error);
  }

  return NextResponse.json({
    success: true,
    checkedAt: now.toISOString(),
    matchdayReminders: matchdayResults,
    fantasyReminders: fantasyResults,
    automaticRetries,
    nativeReceipts
  });
}
