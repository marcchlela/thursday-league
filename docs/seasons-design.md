# Seasons mode design

## Product decision

All Time remains available everywhere. A season is an additional filter and grouping layer; it never replaces or resets historical games, player statistics, or fantasy points.

The admin chooses one scheduling mode:

- **Calendar year**: seasons are generated as January 1 through December 31 and named by year, such as `2026`.
- **Custom season**: the admin provides a name, start date, and end date, such as `2026 Summer League`.

Only one season can be active at a time in the current single-league app. Finished seasons are closed and remain read-only except through the controlled correction flow.

## Proposed data model

### `league_settings`

- `id` — singleton row for the current private league
- `season_mode` — `calendar_year` or `custom`
- `active_season_id` — nullable foreign key to `seasons`
- `updated_at`
- `updated_by` — profile that changed the setting

### `seasons`

- `id`
- `name`
- `starts_on`
- `ends_on`
- `status` — `planned`, `active`, or `closed`
- `created_by`
- `created_at`
- `closed_at`

Database rules:

- `starts_on <= ends_on`
- date ranges cannot overlap
- only one season can have `active` status
- a closed season cannot be edited without a controlled admin correction and audit reason

### Existing tables

- Add `season_id` to `games`.
- Player match stats, events, lineups, and fantasy results inherit their season through the game. They do not need duplicated `season_id` columns.
- All-time totals continue to aggregate every final game.
- Season totals aggregate only final games linked to the selected season.

This keeps one source of truth and prevents a stat or fantasy result from accidentally belonging to a different season than its game.

## Admin experience

Add a **Seasons** section to Admin:

1. Choose Calendar Year or Custom Season mode.
2. Preview the season name and date range.
3. Activate a planned season after confirming how unassigned games will be handled.
4. Close a season with a summary showing its game count, final games, incomplete games, and unassigned games.
5. Reopen or correct a closed season only by entering a reason. The audit history records the change.

Creating a game defaults it to the active season. The admin can choose a different planned season when creating a future game. Final games cannot be moved between seasons without the controlled correction flow.

## User experience

Standings and the Players Stats tab get a shared selector:

- Current season (default)
- Previous named seasons
- All Time

The Fantasy History page gets the same selector. Weekly results still show individual games inside the selected season.

The selected season should be stored in the URL, for example `?season=all-time` or `?season=<season-id>`, so navigating back preserves the view.

## Existing-data migration

The migration should not guess silently.

1. Create the seasons tables and nullable `games.season_id`.
2. Show the admin how many existing games are unassigned.
3. Let the admin create the first season and preview which games fall inside its dates.
4. Assign those games only after confirmation.
5. Keep any unmatched games available in All Time and label them `Unassigned` in Admin until resolved.
6. After every historical game is assigned, make `games.season_id` required for newly created games through a database trigger or controlled create-game function.

## Delivery order

1. Database tables, constraints, RLS, and audit actions.
2. Admin Seasons screen and historical-game assignment preview.
3. Season-aware aggregation helpers with tests proving season totals and All Time totals.
4. Season selectors on Players, Fantasy, and standings with URL persistence.
5. Close-season workflow and controlled corrections.

## Future multi-league compatibility

When the app becomes public, `league_id` will be added to settings, seasons, games, players, memberships, and audit records as part of the security redesign. The season model remains the same; its uniqueness rules become scoped to each league. Avoid putting access-control assumptions into season aggregation code now so this later boundary is easier to introduce.

## Betting relationship

Bets can be built before the multi-league redesign for the private friends-only version. Every betting market should still point to a game, so it automatically inherits the season. Season-bounded historical performance can later be one input to generated probabilities, while all-time performance remains another possible feature.
