import { describe, expect, it } from "vitest";
import { calculatePlayerBreakdown, calculateScore, careerStats } from "./scoring";
import { FantasyPick, Game, GameLineup, GamePlayerStat, MatchEvent, Player } from "./types";

const game: Game = { id: "game-1", game_date: "2026-07-19T18:00:00.000Z", status: "final", potm_player_id: "player-a" };
const players: Player[] = [
  { id: "player-a", name: "Alex", default_position: "outfield", active: true },
  { id: "player-b", name: "Ben", default_position: "goalkeeper", active: true }
];
const lineups: GameLineup[] = [
  { id: "lineup-a", game_id: game.id, player_id: "player-a", team: "A", role: "outfield", slot_index: 1 },
  { id: "lineup-b", game_id: game.id, player_id: "player-b", team: "B", role: "goalkeeper", slot_index: 0 }
];
const events: MatchEvent[] = [
  { id: "event-1", game_id: game.id, event_type: "goal", player_id: "player-a", assist_player_id: null, minute: 4 },
  { id: "event-2", game_id: game.id, event_type: "own_goal", player_id: "player-b", assist_player_id: null, minute: 8 }
];
const playerStats: GamePlayerStat[] = [
  { id: "stat-b", game_id: game.id, player_id: "player-b", team: "B", role: "goalkeeper", goals: 0, assists: 0, saves: 3 }
];

describe("calculateScore", () => {
  it("counts normal goals, own goals, and manual goals for the correct team", () => {
    const manualGoal: GamePlayerStat = { id: "stat-a", game_id: game.id, player_id: "player-a", team: "A", role: "outfield", goals: 1, assists: 0, saves: 0 };
    expect(calculateScore(events, lineups, [...playerStats, manualGoal])).toEqual({ A: 3, B: 0 });
  });
});

describe("calculatePlayerBreakdown", () => {
  it("doubles the complete score for a captain", () => {
    const pick: FantasyPick = { id: "pick-a", squad_id: "squad-1", player_id: "player-a", role: "outfield", is_captain: true, slot_index: 1 };
    const result = calculatePlayerBreakdown({ game, player: players[0], pick, lineups, events, playerStats });
    expect(result.pointsBeforeCaptain).toBe(9);
    expect(result.points).toBe(18);
    expect(result.lines.at(-1)).toBe("captain x2 = 18");
  });

  it("awards goalkeeper save points only to the goalkeeper role", () => {
    const result = calculatePlayerBreakdown({ game, player: players[1], lineups, events, playerStats });
    expect(result.lines).toContain("3 saves = 3");
  });
});

describe("careerStats", () => {
  it("keeps appearances and stats derived from historical records", () => {
    const result = careerStats({ player: players[0], games: [game], lineups, events, playerStats });
    expect(result.appearances).toBe(1);
    expect(result.goals).toBe(1);
    expect(result.ownGoals).toBe(0);
  });
});
