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
NEXT_PUBLIC_LEAGUE_INVITE_CODE=
```

Set `NEXT_PUBLIC_LEAGUE_INVITE_CODE` to a shared league code if you want signup to require an invite code. Leave it empty to keep signup open.

### 3) Run the database SQL

Open Supabase → SQL Editor → New query, paste the full contents of:

```txt
supabase/schema.sql
```

Run it once, then run the migration files in `supabase/migrations` in filename order. Existing projects only need migrations they have not already applied. The latest integrity upgrade is:

```txt
supabase/migrations/20260719_integrity_and_history.sql
```

This migration is required before using the updated lineup, fantasy, archive, or finalization controls.

### 4) Auth setting

Because the app uses usernames and internally maps them to fake local emails, go to Supabase → Authentication → Providers → Email and turn off email confirmation for this private app. Otherwise new users will be asked to confirm an email address that does not really exist.

### 5) Enable Realtime

In Supabase, enable Realtime for these tables:

- `games`
- `game_lineups`
- `events`
- `fantasy_squads`
- `fantasy_picks`
- `players`
- `profiles`

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
- The app keeps the spec wording distinction: roster members are called `players`; fantasy users are not called players in participation reminders.
