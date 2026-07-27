#!/usr/bin/env python3
"""Stress-test candidate Thursday League probabilities against 5v5 scenarios.

This report is deliberately separate from real walk-forward validation.
Synthetic scenarios can expose broken lines, extreme prices, and internally
inconsistent market formulas, but they cannot prove production accuracy.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Sequence, Tuple

try:
    from model.train import (
        EPSILON,
        assisted_goal_probability,
        calibration_rows,
        clamp,
        opponent_adjusted_saves,
    )
except ModuleNotFoundError:  # Direct execution: python model/evaluate_odds.py
    from train import (
        EPSILON,
        assisted_goal_probability,
        calibration_rows,
        clamp,
        opponent_adjusted_saves,
    )


REPORT_SCHEMA_VERSION = 1
EVALUATOR_VERSION = "odds-stress-report-v1"
SUPPORTED_MARKETS = (
    "match_result",
    "total_goals",
    "player_goals",
    "player_assists",
    "goalkeeper_saves",
    "team_saves",
    "own_goal",
)


def poisson_probability(rate: float, value: int) -> float:
    return math.exp(-rate) * rate ** value / math.factorial(value)


def poisson_under(rate: float, line: float) -> float:
    probability = sum(
        poisson_probability(rate, value)
        for value in range(math.floor(line) + 1)
    )
    return clamp(probability, 0.01, 0.99)


def two_way_probabilities(rate: float, line: float) -> Dict[str, float]:
    under = poisson_under(rate, line)
    return {"over": 1.0 - under, "under": under}


def central_half_line(expected_value: float, minimum: float = 0.5) -> float:
    return max(minimum, math.floor(expected_value) + 0.5)


def half_line_range(
    expected_value: float, offsets: Sequence[float], minimum: float = 0.5
) -> List[float]:
    center = central_half_line(expected_value, minimum)
    lines = sorted({max(minimum, center + offset) for offset in offsets})
    positive_steps = [
        abs(offsets[index] - offsets[index - 1])
        for index in range(1, len(offsets))
        if offsets[index] != offsets[index - 1]
    ]
    step = min(positive_steps) if positive_steps else 1.0
    while len(lines) < len(offsets):
        lines.append(lines[-1] + step)
    return lines


def offered_odds(probability: float, margin: float) -> float:
    return max(
        1.01,
        round(1.0 / (clamp(probability, 0.005, 0.995) * (1.0 + margin)), 2),
    )


def actual_over_under(value: float, line: float) -> str:
    return "over" if value > line else "under"


class MetricAccumulator:
    def __init__(self, margin: float) -> None:
        self.margin = margin
        self.market_count = 0
        self.brier_sum = 0.0
        self.log_loss_sum = 0.0
        self.calibration: List[Tuple[float, int]] = []
        self.predicted_by_outcome: Dict[str, float] = defaultdict(float)
        self.observed_by_outcome: Dict[str, int] = defaultdict(int)
        self.minimum_probability = 1.0
        self.maximum_probability = 0.0
        self.minimum_offered_odds = float("inf")
        self.maximum_offered_odds = 0.0
        self.extreme_probability_count = 0

    def add(self, probabilities: Mapping[str, float], actual: str) -> None:
        if actual not in probabilities:
            raise ValueError(f"Actual outcome {actual!r} is missing from probabilities.")
        total = sum(float(value) for value in probabilities.values())
        if not math.isfinite(total) or abs(total - 1.0) > 1e-6:
            raise ValueError(f"Market probabilities must total one; received {total}.")

        self.market_count += 1
        self.observed_by_outcome[actual] += 1
        brier = 0.0
        for key, raw_probability in probabilities.items():
            probability = float(raw_probability)
            if (
                not math.isfinite(probability)
                or probability <= 0.0
                or probability >= 1.0
            ):
                raise ValueError(f"Invalid probability {probability} for {key}.")
            observed = 1 if key == actual else 0
            brier += (probability - observed) ** 2
            self.calibration.append((probability, observed))
            self.predicted_by_outcome[key] += probability
            self.minimum_probability = min(self.minimum_probability, probability)
            self.maximum_probability = max(self.maximum_probability, probability)
            price = offered_odds(probability, self.margin)
            self.minimum_offered_odds = min(self.minimum_offered_odds, price)
            self.maximum_offered_odds = max(self.maximum_offered_odds, price)
            if probability < 0.02 or probability > 0.98:
                self.extreme_probability_count += 1

        self.brier_sum += brier
        self.log_loss_sum += -math.log(
            max(float(probabilities[actual]), EPSILON)
        )

    def summary(self) -> Dict[str, Any]:
        rows = calibration_rows(self.calibration)
        calibration_count = max(len(self.calibration), 1)
        calibration_error = sum(
            row["count"]
            / calibration_count
            * abs(row["mean_prediction"] - row["observed_frequency"])
            for row in rows
        )
        keys = sorted(
            set(self.predicted_by_outcome) | set(self.observed_by_outcome)
        )
        predicted_share = {
            key: self.predicted_by_outcome[key] / self.market_count for key in keys
        }
        observed_share = {
            key: self.observed_by_outcome[key] / self.market_count for key in keys
        }
        maximum_share_gap = max(
            (
                abs(predicted_share[key] - observed_share[key])
                for key in keys
            ),
            default=0.0,
        )
        status = (
            "review"
            if calibration_error >= 0.04 or maximum_share_gap >= 0.05
            else "ok"
        )
        return {
            "market_count": self.market_count,
            "outcome_prediction_count": len(self.calibration),
            "multiclass_brier": self.brier_sum / self.market_count,
            "log_loss": self.log_loss_sum / self.market_count,
            "expected_calibration_error": calibration_error,
            "maximum_outcome_share_gap": maximum_share_gap,
            "predicted_outcome_share": predicted_share,
            "observed_outcome_share": observed_share,
            "probability_range": [
                self.minimum_probability,
                self.maximum_probability,
            ],
            "offered_odds_range": [
                self.minimum_offered_odds,
                self.maximum_offered_odds,
            ],
            "extreme_probability_count": self.extreme_probability_count,
            "calibration": rows,
            "status": status,
        }


def validate_inputs(
    artifact: Dict[str, Any], bundle: Dict[str, Any]
) -> List[Dict[str, Any]]:
    if not isinstance(artifact.get("players"), dict) or not isinstance(
        artifact.get("league_rates"), dict
    ):
        raise ValueError("The fitted artifact is missing players or league_rates.")
    if bundle.get("scenario_schema_version") != 1:
        raise ValueError("Expected scenario schema version 1.")
    if bundle.get("provenance", {}).get("kind") != "synthetic":
        raise ValueError(
            "The odds stress test accepts only provenance-tagged synthetic scenarios."
        )
    scenarios = bundle.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("The scenario bundle must contain at least one scenario.")
    if artifact.get("training_games") != bundle.get("provenance", {}).get(
        "source_real_game_count"
    ):
        raise ValueError(
            "The artifact and scenarios were not built from the same real-game count."
        )
    return scenarios


def player_rate(
    artifact: Dict[str, Any], player_id: str, key: str, league_key: str
) -> float:
    return float(
        artifact["players"].get(player_id, {}).get(
            key, artifact["league_rates"][league_key]
        )
    )


def evaluate_odds(
    artifact: Dict[str, Any],
    bundle: Dict[str, Any],
    margin: float = 0.06,
) -> Dict[str, Any]:
    if not 0.0 <= margin <= 0.5:
        raise ValueError("margin must be between 0 and 0.5.")
    scenarios = validate_inputs(artifact, bundle)
    by_type = {
        market_type: MetricAccumulator(margin)
        for market_type in SUPPORTED_MARKETS
    }
    by_segment: Dict[str, Dict[str, MetricAccumulator]] = {
        market_type: {} for market_type in SUPPORTED_MARKETS
    }
    overall = MetricAccumulator(margin)

    def record(
        market_type: str,
        segment: str,
        probabilities: Mapping[str, float],
        actual: str,
    ) -> None:
        by_type[market_type].add(probabilities, actual)
        by_segment[market_type].setdefault(
            segment, MetricAccumulator(margin)
        ).add(probabilities, actual)
        overall.add(probabilities, actual)

    league = artifact["league_rates"]
    assist_probability = assisted_goal_probability(league)
    for scenario in scenarios:
        result = scenario["simulated_result"]
        totals = result["player_totals"]
        expected_a = float(
            scenario["probability_inputs"]["expected_goals_a"]
        )
        expected_b = float(
            scenario["probability_inputs"]["expected_goals_b"]
        )
        expected_by_team = {"A": expected_a, "B": expected_b}
        actual_result = (
            "A"
            if result["score_a"] > result["score_b"]
            else "B"
            if result["score_b"] > result["score_a"]
            else "draw"
        )
        record(
            "match_result",
            "three_way",
            scenario["probability_inputs"]["match_result"],
            actual_result,
        )

        expected_total = expected_a + expected_b
        actual_total = float(result["score_a"] + result["score_b"])
        for line in half_line_range(expected_total, (-4, -2, 0, 2, 4)):
            record(
                "total_goals",
                f"line_{line:.1f}",
                two_way_probabilities(expected_total, line),
                actual_over_under(actual_total, line),
            )

        for team in ("A", "B"):
            lineup = scenario["lineup"][team]
            opponent = "B" if team == "A" else "A"
            goal_weights = {
                player["player_id"]: max(
                    player_rate(
                        artifact,
                        player["player_id"],
                        "goal_rate",
                        "player_goals",
                    ),
                    0.05,
                )
                for player in lineup
            }
            assist_weights = {
                player["player_id"]: max(
                    player_rate(
                        artifact,
                        player["player_id"],
                        "assist_rate",
                        "player_assists",
                    ),
                    0.03,
                )
                for player in lineup
            }
            goal_weight_total = sum(goal_weights.values())
            assist_weight_total = sum(assist_weights.values())

            for player in lineup:
                player_id = player["player_id"]
                actual = totals[player_id]
                expected_goals = (
                    expected_by_team[team]
                    * goal_weights[player_id]
                    / goal_weight_total
                )
                expected_assists = (
                    expected_by_team[team]
                    * assist_probability
                    * assist_weights[player_id]
                    / assist_weight_total
                )
                for line in (0.5, 1.5, 2.5, 3.5):
                    record(
                        "player_goals",
                        f"line_{line:.1f}",
                        two_way_probabilities(expected_goals, line),
                        actual_over_under(float(actual["goals"]), line),
                    )
                for line in (0.5, 1.5, 2.5):
                    record(
                        "player_assists",
                        f"line_{line:.1f}",
                        two_way_probabilities(expected_assists, line),
                        actual_over_under(float(actual["assists"]), line),
                    )

                if player["role"] == "goalkeeper":
                    save_rate = player_rate(
                        artifact,
                        player_id,
                        "save_rate_as_goalkeeper",
                        "goalkeeper_saves",
                    )
                    expected_saves = opponent_adjusted_saves(
                        save_rate,
                        expected_by_team[opponent],
                        float(league["team_goals"]),
                        15.0,
                    )
                    for line in half_line_range(
                        expected_saves, (-2, 0, 2)
                    ):
                        record(
                            "goalkeeper_saves",
                            f"line_{line:.1f}",
                            two_way_probabilities(expected_saves, line),
                            actual_over_under(float(actual["saves"]), line),
                        )

            actual_team_saves = sum(
                float(total["saves"])
                for total in totals.values()
                if total["team"] == team
            )
            expected_team_saves = opponent_adjusted_saves(
                float(league["goalkeeper_saves"]),
                expected_by_team[opponent],
                float(league["team_goals"]),
                18.0,
            )
            for line in half_line_range(
                expected_team_saves, (-2, 0, 2)
            ):
                record(
                    "team_saves",
                    f"line_{line:.1f}",
                    two_way_probabilities(expected_team_saves, line),
                    actual_over_under(actual_team_saves, line),
                )

        own_goal_probability = clamp(
            1.0 - math.exp(-float(league["own_goals_per_game"])),
            0.02,
            0.35,
        )
        record(
            "own_goal",
            "yes_no",
            {
                "yes": own_goal_probability,
                "no": 1.0 - own_goal_probability,
            },
            "yes" if result["own_goal_count"] > 0 else "no",
        )

    type_summaries = {
        market_type: accumulator.summary()
        for market_type, accumulator in by_type.items()
        if accumulator.market_count
    }
    segment_summaries = {
        market_type: {
            segment: accumulator.summary()
            for segment, accumulator in sorted(segments.items())
        }
        for market_type, segments in by_segment.items()
        if segments
    }
    review_markets = [
        market_type
        for market_type, summary in type_summaries.items()
        if summary["status"] == "review"
    ]
    return {
        "report_schema_version": REPORT_SCHEMA_VERSION,
        "evaluator_version": EVALUATOR_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": artifact.get("model_version"),
        "source": {
            "kind": "synthetic_stress_test",
            "scenario_count": len(scenarios),
            "seed": bundle.get("parameters", {}).get("seed"),
            "source_real_game_count": bundle["provenance"][
                "source_real_game_count"
            ],
            "source_games_sha256": bundle["provenance"].get(
                "source_games_sha256"
            ),
        },
        "parameters": {
            "offered_odds_margin": margin,
            "review_thresholds": {
                "expected_calibration_error": 0.04,
                "maximum_outcome_share_gap": 0.05,
            },
        },
        "candidate_methodology": {
            "match_result": (
                "Independent Poisson team scores from lineup expected goals."
            ),
            "total_goals": (
                "Poisson total from the sum of both teams' expected goals."
            ),
            "player_goals": (
                "Team expected goals distributed by smoothed player goal rate."
            ),
            "player_assists": (
                "League observed assisted-goal share distributed by smoothed "
                "player assist rate."
            ),
            "goalkeeper_saves": (
                "Smoothed goalkeeper save rate with a damped opponent-strength "
                "ratio adjustment."
            ),
            "team_saves": (
                "League save rate with a damped opponent-strength ratio; supports "
                "rotating goalkeepers without double-counting attack strength."
            ),
            "own_goal": (
                "Poisson probability of at least one own goal from the smoothed "
                "league rate."
            ),
        },
        "synthetic_stress_test": {
            "overall": overall.summary(),
            "by_market_type": type_summaries,
            "by_segment": segment_summaries,
            "markets_requiring_review": review_markets,
        },
        "real_web_forecast_reference": artifact.get(
            "exported_web_forecast_evaluation", {}
        ),
        "decision": {
            "production_ready": False,
            "reason": (
                "Synthetic calibration is an engineering stress test, not evidence "
                "of real-world accuracy. Promotion requires enough future finalized "
                "games for real walk-forward evaluation."
            ),
        },
        "privacy": (
            "This aggregate report contains no player identifiers, names, users, "
            "wallets, balances, or individual bets."
        ),
    }


def print_report(report: Dict[str, Any], output: Path) -> None:
    source = report["source"]
    stress = report["synthetic_stress_test"]
    print("Thursday League odds stress report")
    print("=" * 94)
    print(
        f"Scenarios: {source['scenario_count']} synthetic 5v5 games"
        f"  |  Seed: {source['seed']}"
        f"  |  Real games behind priors: {source['source_real_game_count']}"
    )
    print()
    print(
        f"{'Market':<22} {'Bets':>8} {'Brier':>9} {'Log loss':>10} "
        f"{'Cal. gap':>10} {'Max gap':>9} {'Status':>9}"
    )
    print("-" * 94)
    for market_type, summary in stress["by_market_type"].items():
        print(
            f"{market_type:<22} "
            f"{summary['market_count']:>8,d} "
            f"{summary['multiclass_brier']:>9.4f} "
            f"{summary['log_loss']:>10.4f} "
            f"{summary['expected_calibration_error']:>10.2%} "
            f"{summary['maximum_outcome_share_gap']:>9.2%} "
            f"{summary['status'].upper():>9}"
        )
    print("-" * 94)
    overall = stress["overall"]
    print(
        f"{'ALL MARKETS':<22} "
        f"{overall['market_count']:>8,d} "
        f"{overall['multiclass_brier']:>9.4f} "
        f"{overall['log_loss']:>10.4f} "
        f"{overall['expected_calibration_error']:>10.2%} "
        f"{overall['maximum_outcome_share_gap']:>9.2%} "
        f"{overall['status'].upper():>9}"
    )
    reference = report.get("real_web_forecast_reference", {})
    reference_brier = reference.get("brier")
    reference_loss = reference.get("log_loss")
    print()
    print(
        "Real finalized-market reference: "
        f"{reference.get('evaluated_markets', 0)} markets"
        f"  |  Brier: {reference_brier if reference_brier is not None else 'unavailable'}"
        f"  |  Log loss: {reference_loss if reference_loss is not None else 'unavailable'}"
    )
    review = stress["markets_requiring_review"]
    print(
        "Review first: " + ", ".join(review)
        if review
        else "No market type crossed the synthetic review thresholds."
    )
    print()
    print(
        "Important: synthetic results test consistency; "
        "they do not prove real odds accuracy."
    )
    print(f"Full aggregate report written to {output}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Create an aggregate odds stress report from a fitted model and "
            "synthetic scenarios."
        )
    )
    parser.add_argument(
        "--artifact", required=True, type=Path, help="Fitted model artifact JSON."
    )
    parser.add_argument(
        "--scenarios",
        required=True,
        type=Path,
        help="Synthetic scenario bundle JSON.",
    )
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="Path for the aggregate report JSON.",
    )
    parser.add_argument(
        "--margin",
        type=float,
        default=0.06,
        help="Single-market offered-odds margin.",
    )
    args = parser.parse_args()

    with args.artifact.open("r", encoding="utf-8") as handle:
        artifact = json.load(handle)
    with args.scenarios.open("r", encoding="utf-8") as handle:
        scenarios = json.load(handle)
    report = evaluate_odds(artifact, scenarios, args.margin)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print_report(report, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
