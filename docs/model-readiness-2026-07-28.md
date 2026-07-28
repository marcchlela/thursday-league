# Model readiness report — 2026-07-28

## Decision

The model pipeline is ready to collect trustworthy evidence, but no learned
artifact is ready to replace the production probability engine.

Current status: `pipeline_only`

Promotion allowed: no

## Evidence currently available

The latest local real-data export contains:

- 3 finalized games;
- 2 games with complete five-versus-five player totals;
- 1 quarantined legacy game from 2026-07-09 with 3 Team A and 6 Team B
  player totals;
- 0 eligible walk-forward evaluation games after requiring 3 earlier complete
  games;
- 1 finalized production market set containing 66 evaluated probabilities.

Across those 66 market probabilities, Brier score was about `0.397` versus a
uniform-outcome baseline of about `0.503`, or roughly `+21%` Brier skill. This
is one match, not evidence that the model generalizes. It must not be used to
justify promotion or parameter tuning.

The old schema-2 export cannot identify one official retained score forecast.
A fresh schema-3 export after deployment will recover the retained pre-kickoff
match-result generation and begin score-level Brier, log-loss, and goal-error
tracking.

## Readiness controls added

- Forecast exports reject post-kickoff generations.
- One official score forecast is selected per finalized game.
- Regenerated and repaired market families cannot silently double-count the
  same market key.
- Guest-player markets remain evaluable under per-game pseudonymous IDs without
  creating persistent guest history.
- Incomplete or unbalanced historical lineups are excluded from fitting.
- Every export receives a reproducible SHA-256 fingerprint.
- Candidate metrics are compared with league-average and uniform baselines.
- Promotion stays blocked until at least 20 genuine walk-forward games exist
  and the candidate beats the baseline on Brier score and log loss.
- Deleting replaceable markets preserves the underlying generation snapshot.
- Synthetic and external match results are explicitly excluded from the real
  observation record.

## Next real-data checkpoint

After the upcoming match:

1. verify the score and every player stat;
2. finalize the game;
3. export model data from **Admin → Betting**;
4. save it under `model/data/`;
5. run the command documented in `model/README.md` into a new artifact;
6. compare the new report with the previous artifact;
7. investigate the quarantined legacy game separately rather than editing it
   merely to improve model metrics.

The production engine remains unchanged during this evidence-collection phase.
