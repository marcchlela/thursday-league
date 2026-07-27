#!/usr/bin/env python3
"""Generate reproducible 5v5 scenarios from a real Thursday League export.

Scenario bundles intentionally use a different schema from the training export.
They are useful for market stress tests and simulation research, but cannot be
passed to the real-game trainer as observed league history.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Sequence

try:
    from model.train import (
        assisted_goal_probability,
        clamp,
        fitted_players,
        league_rates,
        opponent_adjusted_saves,
        predict_game,
        validate_export,
    )
except ModuleNotFoundError:  # Direct execution: python model/scenarios.py
    from train import (
        assisted_goal_probability,
        clamp,
        fitted_players,
        league_rates,
        opponent_adjusted_saves,
        predict_game,
        validate_export,
    )


SCENARIO_SCHEMA_VERSION = 1
SCENARIO_GENERATOR_VERSION = "five-a-side-scenarios-v1"


def poisson_sample(rng: random.Random, rate: float) -> int:
    """Sample a Poisson count without adding a third-party dependency."""
    threshold = pow(2.718281828459045, -max(rate, 0.0))
    product = 1.0
    value = 0
    while product > threshold:
        value += 1
        product *= rng.random()
    return max(0, value - 1)


def weighted_player(rng: random.Random, player_ids: Sequence[str], weights: Sequence[float]) -> str:
    safe_weights = [max(float(weight), 0.001) for weight in weights]
    return rng.choices(list(player_ids), weights=safe_weights, k=1)[0]


def player_pool(games: Sequence[Dict[str, Any]]) -> List[str]:
    return sorted({
        player_id
        for game in games
        for player_id, total in game["player_totals"].items()
        if total["model_eligible"]
    })


def goalkeeper_history(games: Sequence[Dict[str, Any]]) -> Dict[str, int]:
    result: Dict[str, int] = defaultdict(int)
    for game in games:
        for player_id, total in game["player_totals"].items():
            if total["model_eligible"] and total["role"] == "goalkeeper":
                result[player_id] += 1
    return dict(result)


def fixed_goalkeeper_probability(games: Sequence[Dict[str, Any]]) -> float:
    fixed_teams = 0
    observed_teams = 0
    for game in games:
        for team in ("A", "B"):
            team_players = [
                total for total in game["player_totals"].values()
                if total["model_eligible"] and total["team"] == team
            ]
            if not team_players:
                continue
            observed_teams += 1
            fixed_teams += int(any(total["role"] == "goalkeeper" for total in team_players))
    return fixed_teams / observed_teams if observed_teams else 0.5


def blank_lineup(
    rng: random.Random,
    players: Sequence[str],
    keeper_counts: Dict[str, int],
    fixed_probability: float,
) -> Dict[str, Dict[str, Any]]:
    selected = rng.sample(list(players), 10)
    rng.shuffle(selected)
    result: Dict[str, Dict[str, Any]] = {}
    for team, team_players in (("A", selected[:5]), ("B", selected[5:])):
        keeper_id = None
        experienced = [player_id for player_id in team_players if keeper_counts.get(player_id, 0) > 0]
        if experienced and rng.random() < fixed_probability:
            keeper_id = weighted_player(
                rng,
                experienced,
                [keeper_counts[player_id] for player_id in experienced],
            )
        for player_id in team_players:
            result[player_id] = {
                "team": team,
                "role": "goalkeeper" if player_id == keeper_id else "outfield",
                "goals": 0,
                "assists": 0,
                "saves": 0,
                "own_goals": 0,
                "model_eligible": True,
            }
    return result


def allocate_regular_goals(
    rng: random.Random,
    totals: Dict[str, Dict[str, Any]],
    team: str,
    goal_count: int,
    fitted: Dict[str, Dict[str, Any]],
    league: Dict[str, float],
) -> None:
    players = [player_id for player_id, total in totals.items() if total["team"] == team]
    goal_weights = [fitted.get(player_id, {}).get("goal_rate", league["player_goals"]) for player_id in players]
    assist_weights = [fitted.get(player_id, {}).get("assist_rate", league["player_assists"]) for player_id in players]
    assist_probability = assisted_goal_probability(league)
    for _ in range(goal_count):
        scorer = weighted_player(rng, players, goal_weights)
        totals[scorer]["goals"] += 1
        eligible_assisters = [player_id for player_id in players if player_id != scorer]
        if eligible_assisters and rng.random() < assist_probability:
            assister = weighted_player(
                rng,
                eligible_assisters,
                [assist_weights[players.index(player_id)] for player_id in eligible_assisters],
            )
            totals[assister]["assists"] += 1


def allocate_saves(
    rng: random.Random,
    totals: Dict[str, Dict[str, Any]],
    team: str,
    fitted: Dict[str, Dict[str, Any]],
    league: Dict[str, float],
    opponent_expected_goals: float,
) -> None:
    players = [player_id for player_id, total in totals.items() if total["team"] == team]
    keepers = [player_id for player_id in players if totals[player_id]["role"] == "goalkeeper"]
    baseline_saves = league["goalkeeper_saves"]
    if keepers:
        keeper = keepers[0]
        baseline_saves = fitted.get(keeper, {}).get(
            "save_rate_as_goalkeeper", baseline_saves
        )
        expected_saves = opponent_adjusted_saves(
            baseline_saves,
            opponent_expected_goals,
            league["team_goals"],
            15.0,
        )
        totals[keeper]["saves"] = poisson_sample(rng, clamp(expected_saves, 0.2, 15.0))
        return
    expected_saves = opponent_adjusted_saves(
        baseline_saves,
        opponent_expected_goals,
        league["team_goals"],
        18.0,
    )
    team_saves = poisson_sample(rng, clamp(expected_saves, 0.2, 15.0))
    for _ in range(team_saves):
        totals[rng.choice(players)]["saves"] += 1


def simulate_result(
    rng: random.Random,
    totals: Dict[str, Dict[str, Any]],
    prediction: Dict[str, Any],
    fitted: Dict[str, Dict[str, Any]],
    league: Dict[str, float],
) -> Dict[str, Any]:
    score_a = poisson_sample(rng, prediction["expected_goals_a"])
    score_b = poisson_sample(rng, prediction["expected_goals_b"])
    scoring_slots = ["A"] * score_a + ["B"] * score_b
    own_goal_count = min(poisson_sample(rng, league["own_goals_per_game"]), len(scoring_slots))
    own_goal_slots = rng.sample(range(len(scoring_slots)), own_goal_count) if own_goal_count else []
    regular_goals = {"A": score_a, "B": score_b}

    for slot in own_goal_slots:
        scoring_team = scoring_slots[slot]
        conceding_team = "B" if scoring_team == "A" else "A"
        offenders = [player_id for player_id, total in totals.items() if total["team"] == conceding_team]
        totals[rng.choice(offenders)]["own_goals"] += 1
        regular_goals[scoring_team] -= 1

    allocate_regular_goals(rng, totals, "A", regular_goals["A"], fitted, league)
    allocate_regular_goals(rng, totals, "B", regular_goals["B"], fitted, league)
    allocate_saves(
        rng, totals, "A", fitted, league, prediction["expected_goals_b"]
    )
    allocate_saves(
        rng, totals, "B", fitted, league, prediction["expected_goals_a"]
    )
    return {
        "score_a": score_a,
        "score_b": score_b,
        "own_goal_count": own_goal_count,
        "player_totals": totals,
    }


def generate_scenarios(
    payload: Dict[str, Any],
    count: int = 1000,
    seed: int = 20260726,
    decay: float = 0.90,
    prior_appearances: float = 5.0,
) -> Dict[str, Any]:
    games = validate_export(payload)
    if not 1 <= count <= 100_000:
        raise ValueError("count must be between 1 and 100000.")
    players = player_pool(games)
    if len(players) < 10:
        raise ValueError("At least ten model-eligible players are required to generate 5v5 scenarios.")
    rng = random.Random(seed)
    league = league_rates(games, decay)
    fitted = fitted_players(games, decay, prior_appearances)
    keeper_counts = goalkeeper_history(games)
    fixed_probability = fixed_goalkeeper_probability(games)
    scenarios = []

    for index in range(count):
        totals = blank_lineup(rng, players, keeper_counts, fixed_probability)
        shell = {
            "game_id": f"scenario-{seed}-{index + 1}",
            "game_date": games[-1]["game_date"] if games else "",
            "score_a": 0,
            "score_b": 0,
            "own_goal_count": 0,
            "player_totals": totals,
        }
        prediction = predict_game(games, shell, decay, prior_appearances)
        simulated = simulate_result(rng, totals, prediction, fitted, league)
        scenarios.append({
            "scenario_id": shell["game_id"],
            "source": "synthetic_scenario",
            "lineup": {
                team: [
                    {"player_id": player_id, "role": total["role"]}
                    for player_id, total in totals.items()
                    if total["team"] == team
                ]
                for team in ("A", "B")
            },
            "probability_inputs": {
                "expected_goals_a": prediction["expected_goals_a"],
                "expected_goals_b": prediction["expected_goals_b"],
                "match_result": prediction["probabilities"],
            },
            "simulated_result": simulated,
        })

    source_fingerprint = hashlib.sha256(
        json.dumps(games, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "scenario_schema_version": SCENARIO_SCHEMA_VERSION,
        "generator_version": SCENARIO_GENERATOR_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provenance": {
            "kind": "synthetic",
            "source_export_schema_version": payload.get("schema_version"),
            "source_real_game_count": len(games),
            "source_games_sha256": source_fingerprint,
            "policy": "Synthetic scenarios are for odds stress-testing and simulation research. They are never observed league results or validation evidence.",
        },
        "parameters": {
            "count": count,
            "seed": seed,
            "decay": decay,
            "prior_appearances": prior_appearances,
            "fixed_goalkeeper_probability": fixed_probability,
        },
        "league_rates": league,
        "scenarios": scenarios,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate reproducible synthetic 5v5 odds scenarios.")
    parser.add_argument("--input", required=True, type=Path, help="Admin model export JSON containing real finalized games.")
    parser.add_argument("--output", required=True, type=Path, help="Path for the synthetic scenario bundle.")
    parser.add_argument("--count", type=int, default=1000, help="Number of scenarios to generate.")
    parser.add_argument("--seed", type=int, default=20260726, help="Random seed for reproducibility.")
    parser.add_argument("--decay", type=float, default=0.90, help="Per-game weight retained for older real observations.")
    parser.add_argument("--prior-appearances", type=float, default=5.0, help="League-average prior strength per player.")
    args = parser.parse_args()

    with args.input.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    bundle = generate_scenarios(payload, args.count, args.seed, args.decay, args.prior_appearances)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(bundle, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(
        f"Generated {len(bundle['scenarios'])} synthetic 5v5 scenarios from "
        f"{bundle['provenance']['source_real_game_count']} real finalized games."
    )
    print(f"Seed: {args.seed}")
    print(f"Scenario bundle written to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
