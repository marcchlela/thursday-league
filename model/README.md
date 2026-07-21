# Thursday League probability model

This folder contains the offline, reproducible modelling workspace. Version 1 is a conservative player-lineup statistical model: it learns recent player scoring, assisting, goalkeeper, form, and teammate-combination signals while pulling small samples strongly toward league averages.

It predicts probabilities, not offered odds. The web app remains responsible for adding a transparent margin and the admin remains responsible for approving markets.

## First real training run

1. Open **Admin → Betting** and select **Export model data**.
2. Put the downloaded JSON in `model/data/`.
3. Run:

```powershell
python model/train.py --input model/data/thursday-league-model-data-YYYY-MM-DD.json --output model/artifacts/player-lineup-v1.json
```

The command prints chronological backtest metrics and writes the fitted model artifact. Lower Brier score, log loss, and team-goal MAE are better. Calibration matters too: predictions around 70% should happen close to 70% of the time over a sufficiently large sample.

The exported file contains stable UUIDs for competition-eligible players so games can be joined across time. Excluded guest slots receive a different per-game identifier, never create personal history, and are modelled from neutral league-average priors. The export excludes player names, raw generation snapshots, profiles, users, wallets, balances, and individual bets. Treat it as pseudonymous private data and do not commit it.

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

This is intentionally the baseline. It should not replace the current production probability engine until it has enough real walk-forward results and demonstrably improves calibration.

## Tests

```powershell
python -m unittest discover -s model/tests
```

Test fixtures are synthetic and exist only to verify the software. They are never merged into real league history or presented as evidence that the model is accurate.

## Later research

Public 11v11 event data can help test import pipelines and provide deliberately weak priors, but it is a different sport environment from rotating 5v5 teams. Any adapter, rescaling, or synthetic simulator must live in a separate data provenance path and be evaluated against real Thursday League games before promotion.
