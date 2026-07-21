import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from model.train import match_probabilities, train, validate_export  # noqa: E402


def synthetic_export(game_count=7):
    games = []
    players_a = [f"player-a-{index}" for index in range(5)]
    players_b = [f"player-b-{index}" for index in range(5)]
    for index in range(game_count):
        score_a = 2 + index % 3
        score_b = 1 + (index + 1) % 3
        totals = {}
        for player_index, player_id in enumerate(players_a):
            totals[player_id] = {
                "team": "A", "role": "goalkeeper" if player_index == 0 else "outfield",
                "goals": score_a if player_index == 1 else 0,
                "assists": 1 if player_index == 2 and score_a else 0,
                "saves": 2 + index % 2 if player_index == 0 else 0, "own_goals": 0,
                "model_eligible": True,
            }
        for player_index, player_id in enumerate(players_b):
            totals[player_id] = {
                "team": "B", "role": "goalkeeper" if player_index == 0 else "outfield",
                "goals": score_b if player_index == 1 else 0,
                "assists": 1 if player_index == 2 and score_b else 0,
                "saves": 3 if player_index == 0 else 0, "own_goals": 0,
                "model_eligible": True,
            }
        games.append({
            "game_id": f"synthetic-game-{index}", "game_date": f"2026-0{index + 1}-01T20:00:00Z",
            "season_id": "synthetic-season", "result_version": 1,
            "result_source": "canonical_snapshot", "score_a": score_a, "score_b": score_b,
            "own_goal_count": 0, "player_totals": totals,
        })
    return {
        "schema_version": 2, "exported_at": "2026-07-21T00:00:00Z",
        "privacy": "Synthetic test data", "games": games,
        "forecasts": {"generations": [], "markets": []},
    }


class ModelTrainingTests(unittest.TestCase):
    def test_probabilities_are_normalized(self):
        probabilities = match_probabilities(3.2, 2.7)
        self.assertAlmostEqual(sum(probabilities.values()), 1.0, places=10)
        self.assertTrue(all(0 < value < 1 for value in probabilities.values()))

    def test_walk_forward_training_is_finite_and_pseudonymous(self):
        artifact = train(synthetic_export(), min_history=3)
        evaluation = artifact["walk_forward_evaluation"]
        self.assertEqual(evaluation["evaluated_games"], 4)
        self.assertTrue(math.isfinite(evaluation["three_way_brier"]))
        self.assertTrue(math.isfinite(evaluation["log_loss"]))
        self.assertEqual(artifact["training_games"], 7)
        self.assertIn("player-a-0", artifact["players"])
        self.assertNotIn("name", json.dumps(artifact).lower())

    def test_rejects_wrong_schema(self):
        payload = synthetic_export()
        payload["schema_version"] = 99
        with self.assertRaises(ValueError):
            validate_export(payload)

    def test_guest_slots_use_neutral_priors_without_fitted_history(self):
        payload = synthetic_export()
        guest_id = "guest:synthetic-game-6:A:1"
        guest_total = payload["games"][-1]["player_totals"].pop("player-a-4")
        guest_total["model_eligible"] = False
        payload["games"][-1]["player_totals"][guest_id] = guest_total

        artifact = train(payload, min_history=3)

        self.assertNotIn(guest_id, artifact["players"])
        self.assertEqual(artifact["training_games"], 7)

    def test_cli_writes_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_path = Path(directory) / "artifact.json"
            input_path.write_text(json.dumps(synthetic_export()), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(ROOT / "model" / "train.py"), "--input", str(input_path), "--output", str(output_path)],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output_path.exists())
            self.assertIn("Walk-forward games: 4", result.stdout)


if __name__ == "__main__":
    unittest.main()
