import { describe, expect, it } from "vitest";
import { buildModelExport } from "./modelExport";
import { BettingData, LeagueData } from "./types";

const finalGame = (id: string, date: string) => ({
  id,
  game_date: date,
  status: "final" as const,
  potm_player_id: null,
  season_id: "season-2026"
});

describe("model data export", () => {
  it("uses the latest canonical result and excludes personal and betting records", () => {
    const data: LeagueData = {
      profiles: [{ id: "user-secret", username: "private-username", is_admin: false }],
      players: [
        { id: "player-a", name: "Secret Player A", default_position: "outfield", active: true },
        { id: "player-b", name: "Secret Player B", default_position: "goalkeeper", active: true, competition_eligible: false }
      ],
      games: [finalGame("game-snapshot", "2026-06-01T19:00:00Z"), finalGame("game-legacy", "2026-05-01T19:00:00Z")],
      lineups: [
        { id: "l1", game_id: "game-legacy", player_id: "player-a", team: "A", role: "outfield" },
        { id: "l2", game_id: "game-legacy", player_id: "player-b", team: "B", role: "goalkeeper" }
      ],
      events: [
        { id: "e1", game_id: "game-legacy", event_type: "goal", player_id: "player-a", assist_player_id: null, minute: 4 },
        { id: "e2", game_id: "game-legacy", event_type: "own_goal", player_id: "player-b", assist_player_id: null, minute: 8 }
      ],
      playerStats: [
        { id: "s1", game_id: "game-legacy", player_id: "player-a", team: "A", role: "outfield", goals: 2, assists: 1, saves: 0 },
        { id: "s2", game_id: "game-legacy", player_id: "player-b", team: "B", role: "goalkeeper", goals: 0, assists: 0, saves: 4 }
      ],
      squads: [{ id: "squad-secret", user_id: "user-secret", game_id: "game-legacy" }],
      picks: [{ id: "pick-secret", squad_id: "squad-secret", player_id: "player-a", role: "outfield", is_captain: true, slot_index: 0 }],
      seasons: [{ id: "season-2026", name: "2026", format: "yearly", start_date: "2026-01-01", end_date: "2026-12-31" }],
      leagueSettings: { id: 1, season_mode: "yearly", current_season_id: "season-2026" }
    };
    const betting: BettingData = {
      settings: null,
      generations: [], markets: [], outcomes: [],
      wallets: [{ id: "wallet-secret", user_id: "user-secret", season_id: "season-2026", balance_units: 73, created_at: "", updated_at: "" }],
      slips: [], legs: [], ledger: [], settlementRuns: [],
      resultVersions: [
        { id: "version-1", game_id: "game-snapshot", version_number: 1, score_a: 1, score_b: 1, own_goal_count: 0, player_totals: {}, source_summary: {}, correction_reason: null, created_at: "2026-06-01T20:00:00Z" },
        { id: "version-2", game_id: "game-snapshot", version_number: 2, score_a: 4, score_b: 2, own_goal_count: 1, player_totals: { "player-a": { team: "A", role: "outfield", goals: 4, assists: 0, saves: 0, own_goals: 0 } }, source_summary: {}, correction_reason: "Corrected", created_at: "2026-06-01T21:00:00Z" }
      ]
    };

    const payload = buildModelExport(data, betting);
    expect(payload.schema_version).toBe(2);
    expect(payload.games.map(game => game.game_id)).toEqual(["game-legacy", "game-snapshot"]);
    expect(payload.games[1]).toMatchObject({ result_version: 2, score_a: 4, score_b: 2, result_source: "canonical_snapshot" });
    expect(payload.games[0]).toMatchObject({ score_a: 4, score_b: 0, result_source: "legacy_aggregate" });
    expect(payload.games[0].player_totals["player-a"]).toMatchObject({ goals: 3, assists: 1 });
    expect(payload.games[0].player_totals["player-b"]).toBeUndefined();
    const guestId = Object.keys(payload.games[0].player_totals).find(playerId => playerId.startsWith("guest:game-legacy:B:"));
    expect(guestId).toBeTruthy();
    expect(payload.games[0].player_totals[guestId!]).toMatchObject({ saves: 4, own_goals: 1, model_eligible: false });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("Secret Player");
    expect(serialized).not.toContain("private-username");
    expect(serialized).not.toContain("wallet-secret");
    expect(serialized).not.toContain("squad-secret");
  });
});
