import { NextResponse } from "next/server";
import { sendTrackedPush } from "@/lib/pushNotifications";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderPreference = {
  user_id: string;
  fantasy_deadline: boolean;
  fantasy_reminder_minutes: number;
};

function gameTime(value: string) {
  return new Intl.DateTimeFormat("en-LB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Beirut"
  }).format(new Date(value));
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const now = new Date();
  const latestGameTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const [gamesResult, preferencesResult] = await Promise.all([
    supabaseAdmin
      .from("games")
      .select("id, game_date")
      .eq("status", "draft")
      .gt("game_date", now.toISOString())
      .lte("game_date", latestGameTime),
    supabaseAdmin
      .from("notification_preferences")
      .select("user_id, fantasy_deadline, fantasy_reminder_minutes")
      .eq("fantasy_deadline", true)
  ]);

  if (gamesResult.error || preferencesResult.error) {
    return NextResponse.json({ error: "Could not load reminder candidates." }, { status: 500 });
  }

  const preferences = (preferencesResult.data || []) as ReminderPreference[];
  const results = [];

  for (const game of gamesResult.data || []) {
    const gameTimeMs = new Date(game.game_date).getTime();
    const { data: squads, error: squadsError } = await supabaseAdmin
      .from("fantasy_squads")
      .select("user_id")
      .eq("game_id", game.id);
    if (squadsError) continue;
    const pickedUsers = new Set((squads || []).map(squad => squad.user_id));
    const reminderMinutes = [...new Set(preferences.map(preference => preference.fantasy_reminder_minutes))];

    for (const minutes of reminderMinutes) {
      const reminderAt = gameTimeMs - minutes * 60 * 1000;
      if (now.getTime() < reminderAt || now.getTime() >= gameTimeMs) continue;
      const userIds = preferences
        .filter(preference => preference.fantasy_reminder_minutes === minutes && !pickedUsers.has(preference.user_id))
        .map(preference => preference.user_id);

      try {
        const result = await sendTrackedPush({
          type: "fantasy_deadline",
          gameId: game.id,
          source: "scheduled",
          dedupeKey: `fantasy_deadline:${game.id}:${minutes}`,
          targetUserIds: userIds,
          payload: {
            title: "Fantasy deadline",
            body: `Your team is not saved yet. Fantasy locks at ${gameTime(game.game_date)}. Tap to make your picks.`,
            url: "/fantasy?tab=set",
            tag: `fantasy-deadline-${game.id}`,
            ttl: Math.max(Math.floor((gameTimeMs - now.getTime()) / 1000), 60)
          }
        });
        results.push({ gameId: game.id, minutes, ...result });
      } catch (error) {
        console.error("Fantasy reminder delivery failed", { gameId: game.id, minutes, error });
        results.push({ gameId: game.id, minutes, error: "Reminder delivery failed." });
      }
    }
  }

  return NextResponse.json({ success: true, checkedAt: now.toISOString(), reminders: results });
}
