#!/usr/bin/env python3
"""Train and evaluate Thursday League's conservative player-lineup model.

The module intentionally depends only on Python's standard library so the first
model can be reproduced locally without a separate Python environment.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


SCHEMA_VERSION = 2
MODEL_VERSION = "player-lineup-python-v1"
EPSILON = 1e-12


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def weighted_items(history: Sequence[Dict[str, Any]], decay: float) -> Iterable[Tuple[Dict[str, Any], float]]:
    newest_index = len(history) - 1
    for index, game in enumerate(history):
        yield game, decay ** (newest_index - index)


def validate_export(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"Expected export schema {SCHEMA_VERSION}, received {payload.get('schema_version')!r}.")
    games = payload.get("games")
    if not isinstance(games, list):
        raise ValueError("Export must contain a games array.")

    seen_ids = set()
    for game in games:
        if not isinstance(game, dict) or not isinstance(game.get("game_id"), str):
            raise ValueError("Every game must have a string game_id.")
        if game["game_id"] in seen_ids:
            raise ValueError(f"Duplicate game_id {game['game_id']}.")
        seen_ids.add(game["game_id"])
        if not isinstance(game.get("game_date"), str):
            raise ValueError(f"Game {game['game_id']} is missing game_date.")
        for key in ("score_a", "score_b", "own_goal_count"):
            value = game.get(key)
            if not isinstance(value, (int, float)) or value < 0:
                raise ValueError(f"Game {game['game_id']} has invalid {key}.")
        totals = game.get("player_totals")
        if not isinstance(totals, dict):
            raise ValueError(f"Game {game['game_id']} is missing player_totals.")
        for player_id, total in totals.items():
            if not isinstance(player_id, str) or not isinstance(total, dict):
                raise ValueError(f"Game {game['game_id']} has an invalid player total.")
            if total.get("team") not in ("A", "B") or total.get("role") not in ("goalkeeper", "outfield"):
                raise ValueError(f"Game {game['game_id']} has an invalid team or role for {player_id}.")
            if not isinstance(total.get("model_eligible"), bool):
                raise ValueError(f"Game {game['game_id']} is missing model_eligible for {player_id}.")
            for key in ("goals", "assists", "saves", "own_goals"):
                value = total.get(key)
                if not isinstance(value, (int, float)) or value < 0:
                    raise ValueError(f"Game {game['game_id']} has invalid {key} for {player_id}.")
    return sorted(games, key=lambda game: (game["game_date"], game["game_id"]))


def league_rates(history: Sequence[Dict[str, Any]], decay: float) -> Dict[str, float]:
    game_weight = 0.0
    player_weight = 0.0
    keeper_weight = 0.0
    goals = assists = saves = own_goals = 0.0
    score = 0.0
    keeper_conceded = 0.0

    for game, weight in weighted_items(history, decay):
        game_weight += weight
        score += (float(game["score_a"]) + float(game["score_b"])) * weight
        own_goals += float(game["own_goal_count"]) * weight
        for total in game["player_totals"].values():
            if not total["model_eligible"]:
                continue
            player_weight += weight
            goals += float(total["goals"]) * weight
            assists += float(total["assists"]) * weight
            if total["role"] == "goalkeeper":
                keeper_weight += weight
                saves += float(total["saves"]) * weight
                opponent_score = game["score_b"] if total["team"] == "A" else game["score_a"]
                keeper_conceded += float(opponent_score) * weight

    return {
        "team_goals": score / (2.0 * game_weight) if game_weight else 2.5,
        "player_goals": goals / player_weight if player_weight else 0.5,
        "player_assists": assists / player_weight if player_weight else 0.3,
        "goalkeeper_saves": saves / keeper_weight if keeper_weight else 2.0,
        "goalkeeper_conceded": keeper_conceded / keeper_weight if keeper_weight else 2.5,
        "own_goals_per_game": own_goals / game_weight if game_weight else 0.08,
    }


def player_observations(
    history: Sequence[Dict[str, Any]], player_id: str, decay: float
) -> Dict[str, float]:
    result = defaultdict(float)
    for game, weight in weighted_items(history, decay):
        total = game["player_totals"].get(player_id)
        if not total or not total["model_eligible"]:
            continue
        result["appearances"] += weight
        result["raw_appearances"] += 1.0
        for key in ("goals", "assists", "saves", "own_goals"):
            result[key] += float(total[key]) * weight
        team_score = game["score_a"] if total["team"] == "A" else game["score_b"]
        opponent_score = game["score_b"] if total["team"] == "A" else game["score_a"]
        result["goal_difference"] += float(team_score - opponent_score) * weight
        if total["role"] == "goalkeeper":
            result["keeper_appearances"] += weight
            result["raw_keeper_appearances"] += 1.0
            result["keeper_conceded"] += float(opponent_score) * weight
    return result


def posterior(total: float, appearances: float, prior_rate: float, prior_appearances: float) -> float:
    return (total + prior_rate * prior_appearances) / (appearances + prior_appearances)


def assisted_goal_probability(rates: Dict[str, float]) -> float:
    return clamp(
        rates["player_assists"] / max(rates["player_goals"], 0.1),
        0.15,
        0.90,
    )


def opponent_adjusted_saves(
    baseline_saves: float,
    opponent_expected_goals: float,
    league_team_goals: float,
    maximum: float = 15.0,
) -> float:
    """Adjust saves without counting opponent strength twice.

    A player save rate already reflects the league environment in which it was
    observed. A damped ratio preserves that baseline against average opposition
    and only moves it gradually for stronger or weaker lineups.
    """
    strength_ratio = clamp(
        opponent_expected_goals / max(league_team_goals, 0.1),
        0.50,
        1.50,
    )
    return clamp(baseline_saves * strength_ratio ** 0.45, 0.5, maximum)


def pair_synergy(
    history: Sequence[Dict[str, Any]], player_ids: Sequence[str], decay: float, prior_appearances: float
) -> float:
    values: List[float] = []
    for left, right in combinations(sorted(player_ids), 2):
        weighted_difference = 0.0
        appearances = 0.0
        for game, weight in weighted_items(history, decay):
            left_total = game["player_totals"].get(left)
            right_total = game["player_totals"].get(right)
            if not left_total or not right_total or not left_total["model_eligible"] or not right_total["model_eligible"] or left_total["team"] != right_total["team"]:
                continue
            team = left_total["team"]
            difference = game["score_a"] - game["score_b"]
            weighted_difference += float(difference if team == "A" else -difference) * weight
            appearances += weight
        values.append(weighted_difference / (appearances + prior_appearances))
    return sum(values) / len(values) if values else 0.0


def predict_game(
    history: Sequence[Dict[str, Any]],
    game: Dict[str, Any],
    decay: float = 0.90,
    prior_appearances: float = 5.0,
) -> Dict[str, Any]:
    rates = league_rates(history, decay)
    by_team = {
        "A": [player_id for player_id, total in game["player_totals"].items() if total["team"] == "A"],
        "B": [player_id for player_id, total in game["player_totals"].items() if total["team"] == "B"],
    }

    features: Dict[str, Dict[str, float]] = {}
    for team, player_ids in by_team.items():
        attack_total = 0.0
        form_total = 0.0
        keeper_factors: List[float] = []
        for player_id in player_ids:
            observation = player_observations(history, player_id, decay)
            appearances = observation["appearances"]
            goal_rate = posterior(observation["goals"], appearances, rates["player_goals"], prior_appearances)
            assist_rate = posterior(observation["assists"], appearances, rates["player_assists"], prior_appearances)
            attack_total += goal_rate + 0.20 * assist_rate
            form_total += observation["goal_difference"] / (appearances + prior_appearances)

            role = game["player_totals"][player_id]["role"]
            if role == "goalkeeper":
                keeper_appearances = observation["keeper_appearances"]
                conceded = posterior(
                    observation["keeper_conceded"], keeper_appearances,
                    rates["goalkeeper_conceded"], prior_appearances,
                )
                saves = posterior(
                    observation["saves"], keeper_appearances,
                    rates["goalkeeper_saves"], prior_appearances,
                )
                concession_factor = math.sqrt(max(conceded, 0.1) / max(rates["goalkeeper_conceded"], 0.1))
                save_factor = math.exp(-0.025 * (saves - rates["goalkeeper_saves"]))
                keeper_factors.append(clamp(concession_factor * save_factor, 0.72, 1.35))

        expected_attack = len(player_ids) * (rates["player_goals"] + 0.20 * rates["player_assists"])
        features[team] = {
            "attack_index": clamp(attack_total / max(expected_attack, 0.1), 0.60, 1.55),
            "form": form_total / len(player_ids) if player_ids else 0.0,
            "keeper_factor": sum(keeper_factors) / len(keeper_factors) if keeper_factors else 1.0,
            "synergy": pair_synergy(
                history,
                [player_id for player_id in player_ids if game["player_totals"][player_id]["model_eligible"]],
                decay,
                prior_appearances + 3.0,
            ),
        }

    base = clamp(rates["team_goals"], 0.5, 7.0)
    expected_a = base * features["A"]["attack_index"] ** 0.65 * features["B"]["keeper_factor"]
    expected_b = base * features["B"]["attack_index"] ** 0.65 * features["A"]["keeper_factor"]
    expected_a *= math.exp(0.04 * features["A"]["form"] + 0.03 * features["A"]["synergy"])
    expected_b *= math.exp(0.04 * features["B"]["form"] + 0.03 * features["B"]["synergy"])
    expected_a = clamp(0.85 * expected_a + 0.15 * base, 0.35, 8.0)
    expected_b = clamp(0.85 * expected_b + 0.15 * base, 0.35, 8.0)
    probabilities = match_probabilities(expected_a, expected_b)
    return {
        "expected_goals_a": expected_a,
        "expected_goals_b": expected_b,
        "probabilities": probabilities,
        "features": features,
    }


def poisson_probability(rate: float, value: int) -> float:
    return math.exp(-rate) * rate ** value / math.factorial(value)


def match_probabilities(expected_a: float, expected_b: float, maximum_goals: int = 14) -> Dict[str, float]:
    result = {"A": 0.0, "draw": 0.0, "B": 0.0}
    for score_a in range(maximum_goals + 1):
        probability_a = poisson_probability(expected_a, score_a)
        for score_b in range(maximum_goals + 1):
            probability = probability_a * poisson_probability(expected_b, score_b)
            key = "A" if score_a > score_b else "B" if score_b > score_a else "draw"
            result[key] += probability
    total = sum(result.values())
    return {key: value / total for key, value in result.items()}


def calibration_rows(predictions: Sequence[Tuple[float, int]]) -> List[Dict[str, Any]]:
    rows = []
    for lower_tenth in range(10):
        lower = lower_tenth / 10.0
        upper = (lower_tenth + 1) / 10.0
        samples = [(probability, outcome) for probability, outcome in predictions if lower <= probability <= upper if lower_tenth == 9]
        if lower_tenth != 9:
            samples = [(probability, outcome) for probability, outcome in predictions if lower <= probability < upper]
        if samples:
            rows.append({
                "range": f"{lower:.1f}-{upper:.1f}",
                "count": len(samples),
                "mean_prediction": sum(item[0] for item in samples) / len(samples),
                "observed_frequency": sum(item[1] for item in samples) / len(samples),
            })
    return rows


def walk_forward_evaluation(
    games: Sequence[Dict[str, Any]], min_history: int, decay: float, prior_appearances: float
) -> Dict[str, Any]:
    brier_scores: List[float] = []
    log_losses: List[float] = []
    goal_errors: List[float] = []
    calibration: List[Tuple[float, int]] = []
    rows = []

    for index in range(min_history, len(games)):
        game = games[index]
        prediction = predict_game(games[:index], game, decay, prior_appearances)
        actual = "A" if game["score_a"] > game["score_b"] else "B" if game["score_b"] > game["score_a"] else "draw"
        probabilities = prediction["probabilities"]
        brier = sum((probabilities[key] - (1.0 if key == actual else 0.0)) ** 2 for key in ("A", "draw", "B"))
        log_loss = -math.log(max(probabilities[actual], EPSILON))
        goal_mae = (abs(prediction["expected_goals_a"] - game["score_a"]) + abs(prediction["expected_goals_b"] - game["score_b"])) / 2.0
        brier_scores.append(brier)
        log_losses.append(log_loss)
        goal_errors.append(goal_mae)
        for key in ("A", "draw", "B"):
            calibration.append((probabilities[key], 1 if key == actual else 0))
        rows.append({
            "game_id": game["game_id"],
            "game_date": game["game_date"],
            "history_games": index,
            "expected_goals_a": prediction["expected_goals_a"],
            "expected_goals_b": prediction["expected_goals_b"],
            "probabilities": probabilities,
            "actual": actual,
        })

    return {
        "evaluated_games": len(rows),
        "minimum_history_games": min_history,
        "three_way_brier": sum(brier_scores) / len(brier_scores) if brier_scores else None,
        "log_loss": sum(log_losses) / len(log_losses) if log_losses else None,
        "team_goal_mae": sum(goal_errors) / len(goal_errors) if goal_errors else None,
        "calibration": calibration_rows(calibration),
        "predictions": rows,
        "note": "Metrics are unavailable until more than minimum_history_games finalized games exist." if not rows else None,
    }


def actual_market_outcome(market: Dict[str, Any], game: Dict[str, Any]) -> Optional[str]:
    market_type = market.get("market_type")
    line = market.get("line")
    if market_type == "match_result":
        return "A" if game["score_a"] > game["score_b"] else "B" if game["score_b"] > game["score_a"] else "draw"
    if market_type == "own_goal":
        return "yes" if game["own_goal_count"] > 0 else "no"
    if market_type == "total_goals":
        value = game["score_a"] + game["score_b"]
    elif market_type == "team_saves":
        subject_team = market.get("subject_team")
        if subject_team not in ("A", "B"):
            return None
        value = sum(
            player.get("saves", 0)
            for player in game["player_totals"].values()
            if player.get("team") == subject_team
        )
    elif market_type in ("player_goals", "player_assists", "goalkeeper_saves"):
        player = game["player_totals"].get(market.get("subject_player_id"))
        if not player or not player["model_eligible"] or (market_type == "goalkeeper_saves" and player["role"] != "goalkeeper"):
            return None
        key = {"player_goals": "goals", "player_assists": "assists", "goalkeeper_saves": "saves"}[market_type]
        value = player[key]
    else:
        return None
    if line is None or value == line:
        return None
    return "over" if value > line else "under"


def exported_forecast_evaluation(payload: Dict[str, Any], games: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    game_by_id = {game["game_id"]: game for game in games}
    brier_scores: List[float] = []
    log_losses: List[float] = []
    calibration: List[Tuple[float, int]] = []
    by_type: Dict[str, List[Tuple[float, float]]] = defaultdict(list)

    for market in payload.get("forecasts", {}).get("markets", []):
        game = game_by_id.get(market.get("game_id"))
        if not game:
            continue
        actual = actual_market_outcome(market, game)
        outcomes = market.get("outcomes", [])
        if actual is None or not outcomes:
            continue
        probability_by_key = {outcome["outcome_key"]: float(outcome["fair_probability"]) for outcome in outcomes}
        if actual not in probability_by_key:
            continue
        brier = sum((probability - (1.0 if key == actual else 0.0)) ** 2 for key, probability in probability_by_key.items())
        loss = -math.log(max(probability_by_key[actual], EPSILON))
        brier_scores.append(brier)
        log_losses.append(loss)
        by_type[str(market.get("market_type"))].append((brier, loss))
        for key, probability in probability_by_key.items():
            calibration.append((probability, 1 if key == actual else 0))

    return {
        "evaluated_markets": len(brier_scores),
        "brier": sum(brier_scores) / len(brier_scores) if brier_scores else None,
        "log_loss": sum(log_losses) / len(log_losses) if log_losses else None,
        "by_market_type": {
            market_type: {
                "count": len(values),
                "brier": sum(value[0] for value in values) / len(values),
                "log_loss": sum(value[1] for value in values) / len(values),
            }
            for market_type, values in sorted(by_type.items())
        },
        "calibration": calibration_rows(calibration),
        "note": "This benchmarks probabilities previously generated by the web app; it does not retrain on settled bets." if brier_scores else "No finalized exported forecasts were available.",
    }


def fitted_players(games: Sequence[Dict[str, Any]], decay: float, prior_appearances: float) -> Dict[str, Any]:
    rates = league_rates(games, decay)
    player_ids = sorted({
        player_id
        for game in games
        for player_id, total in game["player_totals"].items()
        if total["model_eligible"]
    })
    result = {}
    for player_id in player_ids:
        observation = player_observations(games, player_id, decay)
        appearances = observation["appearances"]
        keeper_appearances = observation["keeper_appearances"]
        result[player_id] = {
            "appearances": int(observation["raw_appearances"]),
            "keeper_appearances": int(observation["raw_keeper_appearances"]),
            "goal_rate": posterior(observation["goals"], appearances, rates["player_goals"], prior_appearances),
            "assist_rate": posterior(observation["assists"], appearances, rates["player_assists"], prior_appearances),
            "save_rate_as_goalkeeper": posterior(observation["saves"], keeper_appearances, rates["goalkeeper_saves"], prior_appearances),
            "own_goal_rate": posterior(observation["own_goals"], appearances, rates["own_goals_per_game"] / 10.0, prior_appearances),
            "recent_goal_difference": observation["goal_difference"] / (appearances + prior_appearances),
            "conceded_rate_as_goalkeeper": posterior(observation["keeper_conceded"], keeper_appearances, rates["goalkeeper_conceded"], prior_appearances),
        }
    return result


def train(payload: Dict[str, Any], min_history: int = 3, decay: float = 0.90, prior_appearances: float = 5.0) -> Dict[str, Any]:
    games = validate_export(payload)
    if not 0.0 < decay <= 1.0:
        raise ValueError("decay must be greater than 0 and no more than 1.")
    if min_history < 1 or prior_appearances <= 0:
        raise ValueError("min_history and prior_appearances must be positive.")
    return {
        "model_version": MODEL_VERSION,
        "export_schema_version": SCHEMA_VERSION,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "trained_through": games[-1]["game_date"] if games else None,
        "training_games": len(games),
        "parameters": {"decay": decay, "prior_appearances": prior_appearances, "minimum_history_games": min_history},
        "league_rates": league_rates(games, decay),
        "players": fitted_players(games, decay, prior_appearances),
        "walk_forward_evaluation": walk_forward_evaluation(games, min_history, decay, prior_appearances),
        "exported_web_forecast_evaluation": exported_forecast_evaluation(payload, games),
        "limitations": [
            "This is a conservative statistical baseline, not a neural network.",
            "Small samples are strongly smoothed toward league averages.",
            "Stable player IDs are pseudonymous and must still be kept private.",
            "Synthetic and external 11v11 data are not included as Thursday League observations.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Train and backtest the Thursday League player-lineup model.")
    parser.add_argument("--input", required=True, type=Path, help="Admin model export JSON.")
    parser.add_argument("--output", required=True, type=Path, help="Path for the fitted artifact JSON.")
    parser.add_argument("--min-history", type=int, default=3, help="Past games required before a backtest prediction.")
    parser.add_argument("--decay", type=float, default=0.90, help="Per-game weight retained for older observations.")
    parser.add_argument("--prior-appearances", type=float, default=5.0, help="League-average prior strength per player.")
    args = parser.parse_args()

    with args.input.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    artifact = train(payload, args.min_history, args.decay, args.prior_appearances)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2, sort_keys=True)
        handle.write("\n")

    evaluation = artifact["walk_forward_evaluation"]
    print(f"Trained {artifact['model_version']} on {artifact['training_games']} finalized games.")
    print(f"Walk-forward games: {evaluation['evaluated_games']}")
    if evaluation["evaluated_games"]:
        print(f"3-way Brier: {evaluation['three_way_brier']:.4f}")
        print(f"Log loss: {evaluation['log_loss']:.4f}")
        print(f"Team-goal MAE: {evaluation['team_goal_mae']:.4f}")
    else:
        print(evaluation["note"])
    print(f"Artifact written to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
