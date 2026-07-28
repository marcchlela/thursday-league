import { ModelExportPayload } from "./modelExport";

const OUTCOMES = ["A", "draw", "B"] as const;
type MatchOutcome = (typeof OUTCOMES)[number];

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function winningOutcome(probabilities: Record<MatchOutcome, number>) {
  return OUTCOMES.reduce((best, outcome) => (
    probabilities[outcome] > probabilities[best] ? outcome : best
  ), OUTCOMES[0]);
}

export type ScoreForecastEvaluationRow = {
  gameId: string;
  gameDate: string;
  modelVersion: string;
  generatedAt: string;
  expectedA: number;
  expectedB: number;
  actualA: number;
  actualB: number;
  probabilities: Record<MatchOutcome, number>;
  actualOutcome: MatchOutcome;
  predictedOutcome: MatchOutcome;
  brier: number;
  logLoss: number;
  goalMae: number;
};

export function evaluateScoreForecasts(payload: ModelExportPayload) {
  const gameById = new Map(payload.games.map(game => [game.game_id, game]));
  const rows: ScoreForecastEvaluationRow[] = [];

  for (const forecast of payload.forecasts.score_predictions) {
    const game = gameById.get(forecast.game_id);
    if (!game || !forecast.probabilities) continue;
    const probabilities = forecast.probabilities;
    if (!OUTCOMES.every(outcome => Number.isFinite(probabilities[outcome]))) continue;
    const probabilityTotal = OUTCOMES.reduce((total, outcome) => total + probabilities[outcome], 0);
    if (Math.abs(probabilityTotal - 1) > 0.001) continue;

    const actualOutcome: MatchOutcome = game.score_a === game.score_b
      ? "draw"
      : game.score_a > game.score_b ? "A" : "B";
    const brier = OUTCOMES.reduce((total, outcome) => (
      total + (probabilities[outcome] - (outcome === actualOutcome ? 1 : 0)) ** 2
    ), 0);
    const logLoss = -Math.log(Math.max(probabilities[actualOutcome], 1e-12));
    const goalMae = (
      Math.abs(forecast.expected_goals_a - game.score_a)
      + Math.abs(forecast.expected_goals_b - game.score_b)
    ) / 2;

    rows.push({
      gameId: game.game_id,
      gameDate: game.game_date,
      modelVersion: forecast.model_version,
      generatedAt: forecast.generated_at,
      expectedA: forecast.expected_goals_a,
      expectedB: forecast.expected_goals_b,
      actualA: game.score_a,
      actualB: game.score_b,
      probabilities,
      actualOutcome,
      predictedOutcome: winningOutcome(probabilities),
      brier,
      logLoss,
      goalMae
    });
  }

  const brier = average(rows.map(row => row.brier));
  const logLoss = average(rows.map(row => row.logLoss));
  const goalMae = average(rows.map(row => row.goalMae));
  const uniformBrier = rows.length ? 2 / 3 : null;
  const uniformLogLoss = rows.length ? Math.log(3) : null;
  const brierSkillVsUniform = brier != null && uniformBrier
    ? 1 - brier / uniformBrier
    : null;
  const logLossSkillVsUniform = logLoss != null && uniformLogLoss
    ? 1 - logLoss / uniformLogLoss
    : null;
  const readiness = rows.length < 5
    ? "pipeline_only"
    : rows.length < 20
      ? "early_evaluation"
      : (brierSkillVsUniform ?? -1) > 0 && (logLossSkillVsUniform ?? -1) > 0
        ? "candidate_review"
        : "needs_revision";

  return {
    finalizedGames: payload.games.length,
    evaluatedGames: rows.length,
    coverage: payload.games.length ? rows.length / payload.games.length : 0,
    brier,
    logLoss,
    goalMae,
    uniformBaseline: {
      brier: uniformBrier,
      logLoss: uniformLogLoss
    },
    skillVsUniform: {
      brier: brierSkillVsUniform,
      logLoss: logLossSkillVsUniform
    },
    correctOutcomes: rows.filter(row => row.predictedOutcome === row.actualOutcome).length,
    readiness,
    rows: rows.sort((left, right) => (
      new Date(right.gameDate).getTime() - new Date(left.gameDate).getTime()
    ))
  };
}
