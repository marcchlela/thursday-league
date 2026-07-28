import { describe, expect, it } from "vitest";
import { evaluateScoreForecasts } from "./modelEvaluation";
import { ModelExportPayload } from "./modelExport";

describe("model forecast evaluation", () => {
  it("uses probabilistic metrics, a uniform baseline, and explicit readiness gates", () => {
    const payload = {
      schema_version: 3,
      exported_at: "2026-07-28T00:00:00Z",
      privacy: "test",
      games: [{
        game_id: "game-1",
        game_date: "2026-07-20T18:00:00Z",
        season_id: null,
        result_version: 1,
        result_source: "canonical_snapshot",
        score_a: 4,
        score_b: 2,
        own_goal_count: 0,
        player_totals: {}
      }],
      forecasts: {
        policy: "test",
        generations: [],
        markets: [],
        score_predictions: [{
          game_id: "game-1",
          generation_run_id: "run-1",
          model_version: "model-1",
          generated_at: "2026-07-20T12:00:00Z",
          selection: "current_match_result_market",
          expected_goals_a: 3.5,
          expected_goals_b: 2.5,
          probabilities: { A: 0.6, draw: 0.2, B: 0.2 }
        }]
      }
    } satisfies ModelExportPayload;

    const evaluation = evaluateScoreForecasts(payload);
    expect(evaluation.evaluatedGames).toBe(1);
    expect(evaluation.correctOutcomes).toBe(1);
    expect(evaluation.goalMae).toBe(0.5);
    expect(evaluation.brier).toBeCloseTo(0.24);
    expect(evaluation.skillVsUniform.brier).toBeGreaterThan(0);
    expect(evaluation.readiness).toBe("pipeline_only");
  });
});
