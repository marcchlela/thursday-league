import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from model.evaluate_odds import evaluate_odds  # noqa: E402
from model.scenarios import generate_scenarios  # noqa: E402
from model.train import train  # noqa: E402
from test_train import synthetic_export  # noqa: E402


class OddsEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.payload = synthetic_export()
        self.artifact = train(self.payload, min_history=3)
        self.scenarios = generate_scenarios(
            self.payload, count=40, seed=73
        )

    def test_report_covers_markets_without_player_identifiers(self):
        report = evaluate_odds(self.artifact, self.scenarios)
        summaries = report["synthetic_stress_test"]["by_market_type"]

        self.assertEqual(report["report_schema_version"], 1)
        self.assertEqual(report["source"]["scenario_count"], 40)
        self.assertFalse(report["decision"]["production_ready"])
        self.assertEqual(
            set(summaries),
            {
                "match_result",
                "total_goals",
                "player_goals",
                "player_assists",
                "goalkeeper_saves",
                "team_saves",
                "own_goal",
            },
        )
        self.assertNotIn("player-a-0", json.dumps(report))
        for summary in summaries.values():
            self.assertGreater(summary["market_count"], 0)
            self.assertTrue(
                0 <= summary["expected_calibration_error"] <= 1
            )
            self.assertIn(summary["status"], ("ok", "review"))

    def test_cli_prints_and_writes_report(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "artifact.json"
            scenarios_path = Path(directory) / "scenarios.json"
            output_path = Path(directory) / "report.json"
            artifact_path.write_text(
                json.dumps(self.artifact), encoding="utf-8"
            )
            scenarios_path.write_text(
                json.dumps(self.scenarios), encoding="utf-8"
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "model" / "evaluate_odds.py"),
                    "--artifact",
                    str(artifact_path),
                    "--scenarios",
                    str(scenarios_path),
                    "--output",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output_path.exists())
            self.assertIn(
                "Thursday League odds stress report", result.stdout
            )
            self.assertIn(
                "Important: synthetic results test consistency",
                result.stdout,
            )


if __name__ == "__main__":
    unittest.main()
