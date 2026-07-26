import { calculateScore } from "./scoring";
import { isIndividualBettingEligible, isModelEligible } from "./playerEligibility";
import { BettingData, LeagueData } from "./types";

export const MODEL_EXPORT_SCHEMA_VERSION = 2;

export type ModelExportPlayerTotal = {
  team: "A" | "B";
  role: "goalkeeper" | "outfield";
  goals: number;
  assists: number;
  saves: number;
  own_goals: number;
  model_eligible: boolean;
};

export type ModelExportGame = {
  game_id: string;
  game_date: string;
  season_id: string | null;
  result_version: number | null;
  result_source: "canonical_snapshot" | "legacy_aggregate";
  score_a: number;
  score_b: number;
  own_goal_count: number;
  player_totals: Record<string, ModelExportPlayerTotal>;
};

function modelSafePlayerTotals(
  gameId: string,
  totals: Record<string, Omit<ModelExportPlayerTotal, "model_eligible">>,
  league: LeagueData
) {
  const guestCounts = { A: 0, B: 0 };
  return Object.fromEntries(Object.entries(totals).map(([playerId, total]) => {
    const eligible = isModelEligible(league.players.find(player => player.id === playerId));
    if (eligible) return [playerId, { ...total, model_eligible: true } satisfies ModelExportPlayerTotal];
    guestCounts[total.team] += 1;
    return [`guest:${gameId}:${total.team}:${guestCounts[total.team]}`, { ...total, model_eligible: false } satisfies ModelExportPlayerTotal];
  }));
}

export function buildModelExport(league: LeagueData, betting: BettingData) {
  const games: ModelExportGame[] = league.games
    .filter(game => game.status === "final")
    .sort((first, second) => new Date(first.game_date).getTime() - new Date(second.game_date).getTime())
    .map(game => {
      const snapshots = betting.resultVersions
        .filter(version => version.game_id === game.id)
        .sort((first, second) => second.version_number - first.version_number);
      const snapshot = snapshots[0];
      if (snapshot) {
        return {
          game_id: game.id,
          game_date: game.game_date,
          season_id: game.season_id || null,
          result_version: snapshot.version_number,
          result_source: "canonical_snapshot" as const,
          score_a: snapshot.score_a,
          score_b: snapshot.score_b,
          own_goal_count: snapshot.own_goal_count,
          player_totals: modelSafePlayerTotals(game.id, snapshot.player_totals, league)
        };
      }

      const lineups = league.lineups.filter(lineup => lineup.game_id === game.id);
      const events = league.events.filter(event => event.game_id === game.id);
      const manualStats = league.playerStats.filter(stat => stat.game_id === game.id);
      const score = calculateScore(events, lineups, manualStats);
      const playerTotals = Object.fromEntries(lineups.map(lineup => {
        const manual = manualStats.find(stat => stat.player_id === lineup.player_id);
        return [lineup.player_id, {
          team: lineup.team,
          role: lineup.role,
          goals: events.filter(event => event.event_type === "goal" && event.player_id === lineup.player_id).length + (manual?.goals || 0),
          assists: events.filter(event => event.event_type === "goal" && event.assist_player_id === lineup.player_id).length + (manual?.assists || 0),
          saves: manual?.saves || 0,
          own_goals: events.filter(event => event.event_type === "own_goal" && event.player_id === lineup.player_id).length + (manual?.own_goals || 0)
        }];
      }));
      return {
        game_id: game.id,
        game_date: game.game_date,
        season_id: game.season_id || null,
        result_version: null,
        result_source: "legacy_aggregate" as const,
        score_a: score.A,
        score_b: score.B,
        own_goal_count: events.filter(event => event.event_type === "own_goal").length + manualStats.reduce((total, stat) => total + (stat.own_goals || 0), 0),
        player_totals: modelSafePlayerTotals(game.id, playerTotals, league)
      };
    });

  const finalGameIds = new Set(games.map(game => game.game_id));
  const eligiblePlayerIds = new Set(league.players.filter(isIndividualBettingEligible).map(player => player.id));
  const markets = betting.markets
    .filter(market => finalGameIds.has(market.game_id) && (!market.subject_player_id || eligiblePlayerIds.has(market.subject_player_id)))
    .map(market => ({
      game_id: market.game_id,
      market_key: market.market_key,
      market_type: market.market_type,
      subject_player_id: market.subject_player_id,
      subject_team: market.subject_team || null,
      line: market.line,
      generation_run_id: market.generation_run_id,
      outcomes: betting.outcomes.filter(outcome => outcome.market_id === market.id).map(outcome => ({
        outcome_key: outcome.outcome_key,
        fair_probability: Number(outcome.fair_probability),
        offered_odds: Number(outcome.offered_odds)
      }))
    }));

  const generationRunIds = new Set(markets.map(market => market.generation_run_id));
  const generations = betting.generations
    .filter(run => generationRunIds.has(run.id))
    .map(run => ({ id: run.id, game_id: run.game_id, model_version: run.model_version, created_at: run.created_at }));

  return {
    schema_version: MODEL_EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    privacy: "Eligible players use pseudonymous stable UUIDs. Excluded guest slots use per-game IDs and never build personal history. No player names, profile data, wallet balances, users, individual bets, or raw generation snapshots.",
    games,
    forecasts: { generations, markets }
  };
}

export function downloadModelExport(payload: ReturnType<typeof buildModelExport>) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `thursday-league-model-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
