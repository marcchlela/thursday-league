# Virtual betting design

## Product boundary

Thursday League betting uses virtual league coins only. Coins cannot be purchased, sold, transferred, gifted, withdrawn, or redeemed. Every user receives 100.00 coins for each season. There is no arbitrary stake or payout cap; the wallet balance is the only economic stake limit.

This design is intentionally separate from real-money gambling. Adding payments, cash value, transfers, or redemption would be a different product with major legal, safeguarding, and security requirements.

## Weekly rotating teams

The probability engine does not learn a permanent Team A or Team B identity. Those labels only identify the two lineups for one game. Predictions move with the players when the teams change.

Version `player-lineup-v1` uses:

- league-wide team scoring averages;
- player goals and assists per appearance;
- goalkeeper saves and goals conceded;
- an eight-week recency half-life, so older games gradually matter less;
- current lineup attacking strength;
- the opposing lineup and goalkeeper;
- historical teammate-pair performance;
- a five-appearance Bayesian prior toward league averages for new or low-sample players.

The engine predicts fair probabilities first. A configurable margin is then applied to create offered decimal odds. Every generation stores the model version, inputs, league averages, player estimates, and expected goals in `odds_generation_runs`.

## Synthetic data

Randomly generated matches must not be mixed into the observed league history as labelled training data. That would teach the model invented relationships and make its confidence misleading.

Synthetic data remains useful for:

- cold-start priors based on realistic five-a-side score distributions;
- Monte Carlo testing of rare scores and market combinations;
- load and settlement tests;
- checking calibration code before enough real outcomes exist.

Once the league has more completed games, a later model can be trained and evaluated with time-ordered validation. Forecast quality should be tracked with Brier score, log loss, and reliability/calibration plots, not only prediction accuracy.

## Markets

The first version generates:

- Team A / draw / Team B;
- total goals across five half-goal lines centred on the prediction;
- every confirmed player's goals across 0.5, 1.5, 2.5, and 3.5 lines;
- every confirmed player's assists across 0.5, 1.5, and 2.5 lines;
- each confirmed goalkeeper's saves across three model-centred half-save lines;
- any own goal, yes/no.

Half lines normally avoid pushes. If an admin later creates an integer line and the result lands exactly on it, the leg is void.

## Lifecycle

1. The admin schedules a game and confirms both five-player lineups.
2. The admin generates draft probabilities and odds.
3. The admin reviews fair probability, offered odds, expected score, and the complete model snapshot. Draft odds can be corrected.
4. Explicit approval opens all markets.
5. Bets lock automatically five minutes before kick-off. The database enforces the cutoff.
6. Finalizing the game creates a canonical result version and settles every slip in the same database transaction.
7. Reopening and re-finalizing a correction creates a new result version. Only the payout difference is added to the append-only ledger.

Changing a lineup or kick-off time automatically suspends open markets. Accepted odds never change. If a player is removed, that player's leg is void during settlement. When accepted bets already exist, outdated markets cannot be regenerated or silently reopened.

## Canonical results

Settlement uses the same additive totals as the rest of the app:

- team score = scoring events + own goals credited to the opposition + manual player-goal totals;
- player goals = goal events + manual goals;
- player assists = goal-event assists + manual assists;
- goalkeeper saves = manual saves;
- own goals = own-goal events.

At finalization, every lineup player is written into `game_result_versions.player_totals`, including explicit zero values. This removes the missing-row-versus-zero ambiguity from settlement history.

## Wallet and settlement safety

Coins use integer hundredths internally, so 100.00 coins is stored as 10,000 units and floating-point rounding cannot alter balances.

Users cannot write wallets, slips, legs, outcomes, or ledger rows directly. Controlled security-definer functions enforce:

- authentication and wallet ownership;
- a positive stake with at most two decimals;
- sufficient balance;
- one to five unique selections from one game;
- at most one outcome from each market;
- market-open and five-minute cutoff checks;
- idempotent placement using a client request UUID;
- atomic debit, slip, leg, and ledger creation.

Settlement locks the game, slips, and wallets. If any part fails, the entire finalization rolls back. Historical ledger rows are never edited or deleted.

## Bet builders

The first builder supports two to five selections from the same game. Its displayed and accepted quote applies an additional conservative builder reserve to the product of the approved single prices. This protects the cold-start version from pretending that same-game outcomes are independent.

The next modelling upgrade should generate joint builder probabilities from a coherent match simulation: simulate the score, scorer, assister, goalkeeper saves, and own goals together, then price the exact selected intersection. The existing database preserves enough model and outcome history to replace the conservative quote without changing wallet or settlement architecture.

## Future model path

1. Record forecast-versus-result calibration after each final game.
2. Add a deterministic Monte Carlo scenario engine for correlated builders.
3. Compare Poisson and negative-binomial scoring models.
4. Add time-ordered backtesting and model promotion rules.
5. Train a calibrated statistical/ML model only when the real sample is large enough.
6. Keep the current transparent model as a fallback whenever a newer model fails validation or lacks data.

## Starting model development now

We can build the training system before the private league has a large sample, but external professional-football matches must not be treated as if they came from this league. Eleven-a-side matches have different pitch dimensions, match length, player count, substitutions, scoring rates, roles, and stable club identities.

Useful open sources include:

- [StatsBomb Open Data](https://github.com/statsbomb/open-data) for matches, lineups, and detailed events;
- the [Wyscout public match-event dataset](https://figshare.com/collections/Soccer_match_event_dataset/4415000), published alongside its [Scientific Data paper](https://www.nature.com/articles/s41597-019-0247-7);
- [Metrica Sports sample data](https://github.com/metrica-sports/sample-data) for testing event/tracking ingestion and spatial feature code, although its handful of matches is not a training corpus.

External data can safely help us:

- build and test repeatable ingestion, feature, training, and evaluation code;
- compare Poisson and negative-binomial count models;
- learn broad, weak priors such as scorer/assist concentration and goalkeeper workload relationships;
- test calibration charts, time-ordered splits, and model-version packaging;
- exercise a joint match simulator over many realistic scenarios.

It should not directly decide Thursday League odds without a domain adaptation layer and calibration against real Thursday League results.

The recommended implementation sequence is:

1. Create an anonymized export from Supabase containing game date, lineup player IDs, roles, event-plus-manual totals, and result version.
2. Define one stable feature row per player appearance and one per team lineup.
3. Reproduce `player-lineup-v1` in an offline Python notebook/package so the current engine becomes the benchmark.
4. Add external-data adapters that map public events into the same generic feature contract.
5. Fit only weak prior distributions from external data, then rescale scoring and save rates to the five-a-side league.
6. Generate synthetic matches from those fitted distributions for simulation and software testing, keeping them marked as synthetic.
7. Backtest chronologically: train only on games before each prediction and test on the next game.
8. Measure probability quality with Brier score, log loss, and calibration—not win-prediction accuracy alone.
9. Promote a model only when it beats the transparent baseline out of sample; otherwise keep the baseline live.
10. Export the approved model coefficients and version so the app can generate auditable probabilities without depending on an opaque external API.

Future match entry can improve the training data by optionally recording shots, shots on target, and minutes played. These are useful leading indicators, while goals and assists alone are noisy in small samples. Player names should be replaced with stable anonymous IDs in any exported research dataset.
