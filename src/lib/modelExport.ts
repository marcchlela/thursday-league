import { calculateScore } from "./scoring";
import { isIndividualBettingEligible, isModelEligible } from "./playerEligibility";
import { BettingData, LeagueData } from "./types";

export const MODEL_EXPORT_SCHEMA_VERSION = 3;

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
  const playerIdMap = new Map<string, string>();
  const safeTotals = Object.fromEntries(Object.entries(totals).map(([playerId, total]) => {
    const eligible = isModelEligible(league.players.find(player => player.id === playerId));
    if (eligible) {
      playerIdMap.set(playerId, playerId);
      return [playerId, { ...total, model_eligible: true } satisfies ModelExportPlayerTotal];
    }
    guestCounts[total.team] += 1;
    const safePlayerId = `guest:${gameId}:${total.team}:${guestCounts[total.team]}`;
    playerIdMap.set(playerId, safePlayerId);
    return [safePlayerId, { ...total, model_eligible: false } satisfies ModelExportPlayerTotal];
  }));
  return { safeTotals, playerIdMap };
}

export function buildModelExport(league: LeagueData, betting: BettingData) {
  const playerIdMaps = new Map<string, Map<string, string>>();
  const games: ModelExportGame[] = league.games
    .filter(game => game.status === "final")
    .sort((first, second) => new Date(first.game_date).getTime() - new Date(second.game_date).getTime())
    .map(game => {
      const snapshots = betting.resultVersions
        .filter(version => version.game_id === game.id)
        .sort((first, second) => second.version_number - first.version_number);
      const snapshot = snapshots[0];
      if (snapshot) {
        const safe = modelSafePlayerTotals(game.id, snapshot.player_totals, league);
        playerIdMaps.set(game.id, safe.playerIdMap);
        return {
          game_id: game.id,
          game_date: game.game_date,
          season_id: game.season_id || null,
          result_version: snapshot.version_number,
          result_source: "canonical_snapshot" as const,
          score_a: snapshot.score_a,
          score_b: snapshot.score_b,
          own_goal_count: snapshot.own_goal_count,
          player_totals: safe.safeTotals
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
      const safe = modelSafePlayerTotals(game.id, playerTotals, league);
      playerIdMaps.set(game.id, safe.playerIdMap);
      return {
        game_id: game.id,
        game_date: game.game_date,
        season_id: game.season_id || null,
        result_version: null,
        result_source: "legacy_aggregate" as const,
        score_a: score.A,
        score_b: score.B,
        own_goal_count: events.filter(event => event.event_type === "own_goal").length + manualStats.reduce((total, stat) => total + (stat.own_goals || 0), 0),
        player_totals: safe.safeTotals
      };
    });

  const finalGameIds = new Set(games.map(game => game.game_id));
  const finalGameById = new Map(games.map(game => [game.game_id, game]));
  const eligiblePlayerIds = new Set(league.players.filter(isIndividualBettingEligible).map(player => player.id));
  const generationById = new Map(betting.generations.map(run => [run.id, run]));
  const isPreKickoffGeneration = (gameId: string, generationRunId: string) => {
    const game = finalGameById.get(gameId);
    const generation = generationById.get(generationRunId);
    if (!game || !generation) return false;
    const generatedAt = new Date(generation.created_at).getTime();
    const kickoffAt = new Date(game.game_date).getTime();
    return Number.isFinite(generatedAt) && Number.isFinite(kickoffAt) && generatedAt < kickoffAt;
  };
  const markets = betting.markets
    .filter(market => (
      finalGameIds.has(market.game_id)
      && isPreKickoffGeneration(market.game_id, market.generation_run_id)
      && (!market.subject_player_id || eligiblePlayerIds.has(market.subject_player_id))
    ))
    .map(market => {
      const generation = generationById.get(market.generation_run_id)!;
      return {
      game_id: market.game_id,
      market_key: market.market_key,
      market_type: market.market_type,
      subject_player_id: market.subject_player_id
        ? playerIdMaps.get(market.game_id)?.get(market.subject_player_id) || null
        : null,
      subject_team: market.subject_team || null,
      line: market.line,
      generation_run_id: market.generation_run_id,
      model_version: generation.model_version,
      generated_at: generation.created_at,
      outcomes: betting.outcomes.filter(outcome => outcome.market_id === market.id).map(outcome => ({
        outcome_key: outcome.outcome_key,
        fair_probability: Number(outcome.fair_probability),
        offered_odds: Number(outcome.offered_odds)
      }))
    };
    });

  const generationRunIds = new Set(markets.map(market => market.generation_run_id));
  const generations = betting.generations
    .filter(run => finalGameIds.has(run.game_id) && isPreKickoffGeneration(run.game_id, run.id))
    .map(run => ({
      id: run.id,
      game_id: run.game_id,
      model_version: run.model_version,
      created_at: run.created_at,
      used_by_exported_market: generationRunIds.has(run.id)
    }));

  const scorePredictions = games.flatMap(game => {
    const matchResultMarket = markets.find(market => (
      market.game_id === game.game_id && market.market_type === "match_result"
    ));
    const eligibleRuns = betting.generations
      .filter(run => run.game_id === game.game_id && isPreKickoffGeneration(game.game_id, run.id))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    const selectedRun = matchResultMarket
      ? generationById.get(matchResultMarket.generation_run_id)
      : eligibleRuns.find(run => !run.model_version.includes("+eligibility-repair"));
    if (!selectedRun) return [];

    const predictions = selectedRun.input_snapshot?.predictions as Record<string, unknown> | undefined;
    const expectedGoalsA = Number(predictions?.expected_goals_A);
    const expectedGoalsB = Number(predictions?.expected_goals_B);
    if (!Number.isFinite(expectedGoalsA) || !Number.isFinite(expectedGoalsB)) return [];

    const marketProbabilities = matchResultMarket
      ? Object.fromEntries(matchResultMarket.outcomes.map(outcome => [outcome.outcome_key, outcome.fair_probability]))
      : null;
    const snapshotProbabilities = {
      A: Number(predictions?.probability_A),
      draw: Number(predictions?.probability_draw),
      B: Number(predictions?.probability_B)
    };
    const hasSnapshotProbabilities = Object.values(snapshotProbabilities).every(Number.isFinite);
    const probabilities = marketProbabilities && ["A", "draw", "B"].every(key => Number.isFinite(marketProbabilities[key]))
      ? { A: marketProbabilities.A, draw: marketProbabilities.draw, B: marketProbabilities.B }
      : hasSnapshotProbabilities
        ? snapshotProbabilities
        : null;

    return [{
      game_id: game.game_id,
      generation_run_id: selectedRun.id,
      model_version: selectedRun.model_version,
      generated_at: selectedRun.created_at,
      selection: matchResultMarket ? "current_match_result_market" : "latest_preserved_pre_kickoff_run",
      expected_goals_a: expectedGoalsA,
      expected_goals_b: expectedGoalsB,
      probabilities
    }];
  });

  return {
    schema_version: MODEL_EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    privacy: "Eligible players use pseudonymous stable UUIDs. Excluded guest slots use per-game IDs and never build personal history. No player names, profile data, wallet balances, users, individual bets, or raw generation snapshots.",
    games,
    forecasts: {
      policy: "Only generations created before kick-off are exported. Each game's official score forecast prefers the generation attached to its retained match-result market.",
      generations,
      score_predictions: scorePredictions,
      markets
    }
  };
}

export type ModelExportPayload = ReturnType<typeof buildModelExport>;

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
