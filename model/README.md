# Thursday League probability model

This folder contains the offline, reproducible modelling workspace. Version 1 is a conservative player-lineup statistical model: it learns recent player scoring, assisting, goalkeeper, form, and teammate-combination signals while pulling small samples strongly toward league averages.

It predicts probabilities, not offered odds. The web app remains responsible for adding a transparent margin and the admin remains responsible for approving markets.

## Model-readiness workflow

1. Open **Admin → Betting** and select **Export model data**.
2. Put the downloaded JSON in `model/data/`.
3. Run:

```powershell
python model/train.py --input model/data/thursday-league-model-data-YYYY-MM-DD.json --output model/artifacts/player-lineup-v1.json
```

The command validates and fingerprints the export, quarantines games without
five player totals per team, prints chronological backtest and production
forecast metrics, and writes the fitted artifact. Lower Brier score, log loss,
and team-goal MAE are better.

The artifact includes:

- a SHA-256 fingerprint of the exact export;
- a data-quality report and every quarantined game ID;
- league-average Poisson and uniform three-way baselines;
- walk-forward candidate metrics and skill versus baseline;
- one retained production score forecast per finalized game;
- market-level metrics and per-market-type results;
- an explicit readiness status and promotion blockers.

Calibration matters too: predictions around 70% should happen close to 70% of
the time over a sufficiently large sample. One or two good results are not
evidence of calibration.

The exported file contains stable UUIDs for model-eligible players so games can
be joined across time. Excluded guest slots receive a different per-game
identifier, never create personal history, and are modelled from neutral
league-average priors. Guest betting forecasts can still be evaluated under
that per-game identifier. The export excludes player names, raw generation
snapshots, profiles, users, wallets, balances, and individual bets. Treat it as
pseudonymous private data and do not commit it.

Only forecasts generated before kick-off are exported. The official score
forecast prefers the generation attached to the retained match-result market.
Deleting replaceable markets no longer deletes the underlying generation
snapshot.

## Local safety boundary

`train.py` only reads the JSON path supplied with `--input` and writes the artifact path supplied with `--output`. It does not import the Supabase client, make network requests, update the database, or change approved betting markets. Model exports and artifacts are Git-ignored.

The web app continues using its current transparent probability engine until a model is deliberately reviewed, versioned, and integrated in a separate code change. Running this trainer repeatedly is therefore safe even when `.env.local` points at the live Supabase project.

## What “training” means in v1

- Every historical game is processed in date order.
- For each backtest game, the model sees only earlier games.
- Recent games receive more weight than old games.
- New and low-appearance players are smoothed toward league averages.
- Reusable guest players do not accumulate player form or teammate-combination history.
- Player lineup strength, opponent goalkeeper performance, recent form, and teammate combinations affect expected goals.
- Independent Poisson score distributions turn expected goals into win/draw probabilities.
- Previously generated web probabilities are separately scored against final outcomes when available.

This is intentionally a candidate baseline. It must not replace the current
production probability engine until it has at least 20 genuine walk-forward
games, beats the league-average baseline on Brier score and log loss, has no
unresolved data-quality exclusions, and receives a deliberate review.

With only a few completed league games, training can confirm that the pipeline
runs, but it cannot establish that a new learned model generalizes better.
Synthetic or random matches are useful for software tests and simulation
experiments only; they must never be mixed into the real evaluation record.

## Matchday operating procedure

Before kick-off:

1. Confirm both five-player lineups.
2. Generate and review betting markets before the lock.
3. Leave the generation run in place; it is the immutable prediction record.
4. Do not regenerate merely because the prediction looks surprising.

After the game:

1. Enter and verify the complete result and player stat grid.
2. Finalize the game once the result is correct.
3. Export model data again from **Admin → Betting**.
4. Run `train.py` into a new artifact path. Keep the earlier artifact until the
   comparison has been reviewed.
5. Compare production forecast metrics, walk-forward metrics, baselines,
   exclusions, and readiness blockers.
6. Keep the production model unchanged unless the promotion gate is met.

Result corrections create a newer canonical result version. Re-export and
rerun the report after a correction; the input fingerprint makes the changed
dataset explicit.

## Tests

```powershell
python -m unittest discover -s model/tests
```

Test fixtures are synthetic and exist only to verify the software. They are never merged into real league history or presented as evidence that the model is accurate.

## Later research

Public 11v11 event data can help test import pipelines and provide deliberately weak priors, but it is a different sport environment from rotating 5v5 teams. Any adapter, rescaling, or synthetic simulator must live in a separate data provenance path and be evaluated against real Thursday League games before promotion.
