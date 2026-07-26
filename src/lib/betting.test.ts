import { describe, expect, it } from "vitest";
import { bettingSelectionGroup, generatePlayerLineupMarkets, quoteBuilderOdds } from "./betting";
import { Game, GameLineup, GamePlayerStat, LeagueData, Player } from "./types";

function testLeague(): LeagueData {
  const players: Player[] = Array.from({ length: 10 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: index === 1 ? "Form Player" : `Player ${index + 1}`,
    default_position: index === 0 || index === 5 ? "goalkeeper" : "outfield",
    active: true
  }));
  const history: Game[] = Array.from({ length: 4 }, (_, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    game_date: `2026-0${index + 3}-01T19:00:00.000Z`,
    status: "final",
    potm_player_id: null,
    season_id: "20000000-0000-4000-8000-000000000001"
  }));
  const target: Game = {
    id: "30000000-0000-4000-8000-000000000001",
    game_date: "2026-07-30T19:00:00.000Z",
    status: "draft",
    potm_player_id: null,
    season_id: "20000000-0000-4000-8000-000000000001"
  };
  const lineups: GameLineup[] = [...history, target].flatMap(game => players.map((player, index) => ({
    id: `${game.id}-${index}`,
    game_id: game.id,
    player_id: player.id,
    team: index < 5 ? "A" as const : "B" as const,
    role: index === 0 || index === 5 ? "goalkeeper" as const : "outfield" as const,
    slot_index: index % 5
  })));
  const playerStats: GamePlayerStat[] = history.map((game, index) => ({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    game_id: game.id,
    player_id: players[1].id,
    team: "A",
    role: "outfield",
    goals: 3,
    assists: 1,
    saves: 0
  }));
  return {
    profiles: [], players, games: [target, ...history], lineups, events: [], playerStats,
    squads: [], picks: [], seasons: [{ id: target.season_id!, name: "2026", format: "yearly", start_date: "2026-01-01", end_date: "2026-12-31" }],
    leagueSettings: { id: 1, season_mode: "yearly", current_season_id: target.season_id! }
  };
}

describe("player-lineup betting model", () => {
  it("creates complete probability markets with an admin margin", () => {
    const data = testLeague();
    const game = data.games[0];
    const result = generatePlayerLineupMarkets(data, game, 0.06);
    expect(result.markets.length).toBe(89);
    for (const market of result.markets) {
      const probability = market.outcomes.reduce((total, outcome) => total + outcome.fair_probability, 0);
      expect(probability).toBeCloseTo(1, 6);
      expect(market.outcomes.every(outcome => outcome.offered_odds >= 1.01)).toBe(true);
    }
    const predictions = result.snapshot.predictions as Record<string, number>;
    expect(predictions.expected_goals_A).toBeGreaterThan(predictions.expected_goals_B);
    expect(result.markets.filter(market => market.market_type === "total_goals")).toHaveLength(5);
    expect(result.markets.filter(market => market.market_type === "team_saves")).toHaveLength(6);
    expect(result.markets.filter(market => market.market_type === "player_goals" && market.subject_player_id === data.players[1].id).map(market => market.line)).toEqual([0.5, 1.5, 2.5, 3.5]);
  });

  it("moves strength with a player when the weekly teams change", () => {
    const data = testLeague();
    const game = data.games[0];
    const formPlayer = data.players[1];
    const otherPlayer = data.players[6];
    const formLineup = data.lineups.find(lineup => lineup.game_id === game.id && lineup.player_id === formPlayer.id)!;
    const otherLineup = data.lineups.find(lineup => lineup.game_id === game.id && lineup.player_id === otherPlayer.id)!;
    formLineup.team = "B";
    otherLineup.team = "A";
    const result = generatePlayerLineupMarkets(data, game);
    const predictions = result.snapshot.predictions as Record<string, number>;
    expect(predictions.expected_goals_B).toBeGreaterThan(predictions.expected_goals_A);
  });

  it("treats an excluded guest as a neutral slot and creates no individual markets", () => {
    const data = testLeague();
    const game = data.games[0];
    const guest = data.players[1];
    guest.player_type = "guest";
    guest.fantasy_eligible = false;
    guest.individual_betting_eligible = false;

    const result = generatePlayerLineupMarkets(data, game);
    const guestMarkets = result.markets.filter(market => market.subject_player_id === guest.id);
    const teamA = result.snapshot.team_A as Array<{
      player_id: string;
      player_type: string;
      model_eligible: boolean;
      individual_betting_eligible: boolean;
      model: { appearances: number };
    }>;
    const guestSnapshot = teamA.find(player => player.player_id === guest.id);

    expect(guestMarkets).toHaveLength(0);
    expect(result.markets).toHaveLength(82);
    expect(guestSnapshot).toMatchObject({
      player_type: "guest",
      model_eligible: false,
      individual_betting_eligible: false,
      model: { appearances: 0 }
    });
  });

  it("quotes builders more conservatively than multiplying single prices", () => {
    const product = 2 * 2.5 * 1.8;
    expect(quoteBuilderOdds([2, 2.5, 1.8], 0.1)).toBeLessThan(product);
    expect(quoteBuilderOdds([2], 0.1)).toBe(2);
  });

  it("groups alternate lines for the same subject into one builder selection family", () => {
    expect(bettingSelectionGroup({ market_type: "total_goals", subject_player_id: null })).toBe("total_goals:game");
    expect(bettingSelectionGroup({ market_type: "player_goals", subject_player_id: "player-1" })).toBe("player_goals:player-1");
    expect(bettingSelectionGroup({ market_type: "team_saves", subject_player_id: null, subject_team: "A" })).toBe("team_saves:A");
  });
});
