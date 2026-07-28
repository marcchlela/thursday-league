# Thursday League

A Next.js + Supabase web app for a weekly 5-a-side friend-group league: match tracking, live score events, player stats, and a fantasy league with a pitch-based team picker.

## What is included

- Username + password auth using Supabase Auth.
- First account created becomes admin automatically through the database trigger.
- Admin player roster management.
- Admin game creation, lineup setup, live/final statuses, events, own goals, assists, and Player of the Match.
- Automatic score calculation from events.
- Players page with search, roster cards, and career leaderboards for appearances, goals, assists, saves, clean sheets, and own goals.
- Fantasy page with Set Team, Standings, and History tabs.
- Pitch-style fantasy picker with 4 outfield + 1 GK, or 5 outfield if no GK is in that week's lineup.
- Captain chip and doubled fantasy points.
- Profile page with expandable weekly history plus account username and password settings.
- Transactional lineup and fantasy saves with database-side squad validation.
- Final-game locking, controlled corrections, player archiving, and an admin audit-log foundation.
- Push notifications with per-event preferences, admin-authored announcements, fantasy reminders, delivery history, and retry controls.
- Yearly or custom seasons with seasonal and all-time standings.
- Virtual-coin betting with player-lineup probability modelling, admin-approved odds, singles, same-game builders, transactional settlement, and correction recalculation.
- Supabase Realtime subscriptions for live updates.
- Turf/blue/chalk/floodlight visual system with generated turf texture assets.

## Stack

- Next.js App Router
- React
- Tailwind CSS
- Supabase Auth + Postgres + Realtime
- lucide-react icons

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Create environment file

Copy `.env.example` to `.env.local` and fill in your Supabase project values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
LEAGUE_INVITE_CODE=use-a-long-random-server-only-code
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`LEAGUE_INVITE_CODE` is checked only on the server and must never use the `NEXT_PUBLIC_` prefix. Use a long random code and set the same server-only variables in Vercel. `NEXT_PUBLIC_APP_URL` should be the deployed HTTPS origin in production. The service-role key is required only by server routes and must never be exposed to browser code.

Generate a strong human-friendly code with:

```bash
npm run invite:generate
```

### 3) Run the database SQL

Open Supabase → SQL Editor → New query, paste the full contents of:

```txt
supabase/schema.sql
```

Run it once, then run the migration files in `supabase/migrations` in filename order. Existing projects only need migrations they have not already applied. The latest feature migrations are:

```txt
supabase/migrations/20260719_integrity_and_history.sql
supabase/migrations/20260719220000_notification_preferences_and_delivery.sql
supabase/migrations/20260719223000_add_seasons.sql
supabase/migrations/20260719230000_improve_controlled_corrections.sql
supabase/migrations/20260721220000_add_virtual_betting.sql
supabase/migrations/20260721234500_expand_betting_management_and_social.sql
supabase/migrations/20260722010000_add_competition_eligible_players.sql
supabase/migrations/20260722020000_add_custom_notifications.sql
supabase/migrations/20260722030000_add_bet_cashout_and_final_privacy.sql
supabase/migrations/20260723010000_add_profile_avatars.sql
supabase/migrations/20260723020000_add_account_lifecycle.sql
supabase/migrations/20260724010000_rotating_goalkeepers_and_stat_grid.sql
supabase/migrations/20260725010000_player_eligibility_and_controlled_writes.sql
supabase/migrations/20260726010000_admin_wallet_adjustments.sql
supabase/migrations/20260727010000_restore_lineup_publication_status.sql
supabase/migrations/20260727020000_remove_public_bet_slips.sql
supabase/migrations/20260728010000_security_betting_and_fantasy_privacy.sql
```

Run all migrations in filename order. The virtual betting migration depends on the integrity, seasons, and controlled-corrections migrations. The expanded betting migration adds alternate lines, safe admin edit/delete controls, and privacy-aware league picks and standings. The competition-eligibility migration adds reusable guest players that can play in a match without entering fantasy, personal betting markets, league statistics, or player-model history. The custom-notification migration adds opted-in admin announcements to the existing delivery history and retry workflow. The profile-avatar migration creates the avatar bucket and controlled profile update function. The account-lifecycle migration adds safe deactivation and anonymized deletion without removing historical fantasy or betting results.

### 4) Auth settings

Because the app uses usernames and internally maps them to fake local emails:

1. Go to **Supabase → Authentication → Providers → Email** and turn off email confirmation.
2. Disable direct public signup after configuring `LEAGUE_INVITE_CODE` and `SUPABASE_SERVICE_ROLE_KEY`.

Account creation now goes through `/api/auth/signup`, which validates and rate-limits the league code on the server before using the service role to create the user. If direct Supabase signup remains enabled, someone could bypass the app route by calling the public Auth endpoint directly.

### 5) Enable Realtime

In Supabase, enable Realtime for these tables:

- `games`
- `game_lineups`
- `events`
- `fantasy_squads`
- `fantasy_picks`
- `players`
- `profiles`
- `betting_markets`
- `betting_outcomes`
- `betting_wallets`
- `bet_slips`
- `bet_legs`
- `coin_ledger`
- `game_result_versions`
- `bet_settlement_runs`

### 6) Run locally

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

### 7) Create the first account

Go to `/login`, create the first username/password account. The first account automatically becomes admin.

This project internally maps usernames to a fake email format for Supabase Auth, like:

```txt
marc@your-project-ref.supabase.co
```

Users only see usernames in the UI.

## Deploying

- Push this folder to GitHub.
- Import the repo in Vercel.
- Add the same two env vars in Vercel Project Settings.
- Deploy.

## Notes

- Fantasy points are calculated live from stored games, lineups, events, and picks. Editing events or lineups automatically changes points the next time the app loads/realtime refreshes.
- Supabase RLS prevents normal users from changing games, players, lineups, or events.
- Normal users can only save/edit their own fantasy squad before the game is live/final.
- Fantasy saving also locks automatically at the scheduled kickoff time.
- Players with historical records are archived instead of deleted so old results and fantasy points stay intact.
- Admins can turn off `Fantasy, stats & bets` for reusable guest players. Their real goals still count toward the match score and game-level betting results, but they have no career totals, fantasy points, individual betting markets, or persistent model identity.
- Betting coins are virtual only: no purchase, sale, transfer, real-money withdrawal, or real-world value.
- Pending bets can be cancelled for a full virtual-coin refund until scheduled kickoff. Other bettors' picks, stakes, and odds remain private until the result is final.
- Betting closes five minutes before kick-off at the database level. Finalizing a game freezes an additive event-plus-manual-stat result version and settles bets atomically.
- See `docs/virtual-betting-design.md` for model, security, settlement, correction, and future ML details.
- The app keeps the spec wording distinction: roster members are called `players`; fantasy users are not called players in participation reminders.
