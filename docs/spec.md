# Thursday League Product Spec

## 1. Overview

Thursday League is a private web app for a weekly 5-a-side football group. It combines match management, live score/event tracking, player stats, and a fantasy game where members pick a five-player squad from the weekly lineups.

The app is built for a small friend group, not a public sports platform. The experience should feel fast, clear, and match-day friendly: admins can manage games without friction, and normal users can view games, track stats, and set fantasy picks.

## 2. Core Goals

- Let the admin manage the real Thursday roster.
- Let the admin create games, set 5v5 lineups, log events, and finalize results.
- Let all users view upcoming, live, and historical games.
- Let each user create one fantasy squad per active game.
- Automatically calculate match scores, player stats, fantasy points, standings, and history.
- Keep admin-only controls hidden and protected from normal users.
- Keep setup simple enough for a friend-group app using Supabase and Next.js.

## 3. User Roles

### Normal User

Normal users can:

- Sign up and log in with username and password.
- View the home game page.
- Browse all games in the games archive.
- Open individual game detail pages.
- View roster players and player career stats.
- Set fantasy picks while the game is open.
- View fantasy standings and history.
- View profile, rank, weekly history, and change password.

Normal users cannot:

- See the Admin nav link.
- Access the admin page by manually typing `/admin`.
- Create, edit, or delete games, players, lineups, events, or POTM.

### Admin

The first account created becomes admin automatically through the database trigger.

Admins can:

- Do everything normal users can do.
- Access the Admin page.
- Add, edit, activate/deactivate, and delete roster players.
- Create and delete games.
- Edit game date/time.
- Set and edit lineups.
- Mark games upcoming, draft, live, or final.
- Add and delete match events.
- Save Player of the Match.

## 4. Authentication

The UI uses username and password, but Supabase Auth requires email-shaped identifiers. Internally, usernames are converted into fake email-style identifiers using the Supabase project domain.

Example:

```txt
username: marc
internal auth email: marc@your-project-ref.supabase.co
```

Users never see or enter an email.

### Signup Fields

- Username
- Password
- Confirm password
- Optional invite code, if configured

### Invite Code

The app supports a simple invite code gate:

```env
NEXT_PUBLIC_LEAGUE_INVITE_CODE=your-code-here
```

If this value is set, signup shows an invite-code field. The account is only created if the entered code matches the configured code.

Important security note: this is a friendly privacy gate, not high-security access control. Because the code is exposed as a `NEXT_PUBLIC_` value, a technical user could inspect the browser bundle and find it. For a friend league, this is usually enough. For stronger security, invite codes should be checked server-side against a database table or API route.

### Supabase Auth Setting

Email confirmation should be disabled in Supabase because the app uses generated internal email addresses.

Supabase path:

```txt
Authentication -> Providers -> Email -> Confirm Email off
```

## 5. Navigation

Authenticated users see:

- Game
- Games
- Players
- Fantasy
- Profile

Admins additionally see:

- Admin

The mobile nav adapts to the number of visible links. Admin is only shown to admin users.

## 6. Public Pages

### 6.1 Game Home Page

Route:

```txt
/
```

Purpose:

Shows the main league dashboard.

Content:

- Hero section with Thursday League branding.
- Stat cards:
  - Total games
  - Participants
- Featured game:
  - Live game if one exists
  - Otherwise most recent final game
- Next upcoming game card

Interactions:

- Featured game card is clickable.
- Next upcoming game card is clickable.
- Clicking opens the game detail page.

### 6.2 Games Archive

Route:

```txt
/games
```

Purpose:

Lets users browse every game instead of only the featured/latest game.

Content per game:

- Status chip
- Date/time
- Score
- Team A preview
- Team B preview

Lineup ordering:

- Goalkeeper first
- Then outfield players alphabetically

Interactions:

- Each game card links to `/games/[id]`.

### 6.3 Game Detail Page

Route:

```txt
/games/[id]
```

Purpose:

Shows all details for one game.

Content:

- Back link
- Game status
- Date/time
- Score
- Stat cards:
  - Lineup count
  - Event count
  - Fantasy squad count
  - POTM
- Team A lineup
- Team B lineup
- Events list
- Recorded player stats, when available

Lineup ordering:

- Goalkeeper first
- Then outfield players alphabetically

Event display:

- Minute, if provided
- Goal or own goal
- Scoring player
- Assist, if provided
- Scoring team

### 6.4 Players Page

Route:

```txt
/players
```

Purpose:

Shows the real football roster, separate from fantasy user accounts.

Content per player:

- Name
- Default position
- Active/inactive status
- Career stats:
  - Appearances
  - Goals
  - Assists
  - Clean sheets
  - Saves
  - Own goals

Stats are calculated from saved games, lineups, and events.

### 6.5 Profile Page

Route:

```txt
/profile
```

Purpose:

Shows the logged-in user's account and fantasy history.

Content:

- Username
- Account type:
  - Admin account
  - Fantasy account
- Season total points
- Current rank
- Change password form
- Weekly fantasy results

## 7. Admin Page

Route:

```txt
/admin
```

Access:

- Hidden from non-admin navigation.
- Redirects non-admin users home.
- Does not mount or display admin controls for non-admin users.

The Admin page has two tabs:

- Games
- Roster

## 8. Admin: Roster

Admins can:

- Add players
- Edit players
- Delete players
- Set default position
- Toggle active/inactive

Player fields:

- Name
- Default position:
  - Outfield
  - Goalkeeper
- Active flag

Feedback:

- Player added toast
- Player saved toast
- Player deleted toast
- Error toasts when Supabase returns an error

Delete behavior:

- Uses an in-app confirmation modal.
- No browser `confirm()` popups.

## 9. Admin: Games

The Games admin tab includes:

- Quick Start checklist
- Create Game card
- One expandable section per game

There is no game dropdown selector. Every game remains visible as its own collapsible panel.

### 9.1 Quick Start Checklist

Shown when setup is incomplete.

Steps:

- Add roster
- Create game
- Set lineups
- Open fantasy
- Mark live

The checklist helps an admin understand what is left before the league is ready.

### 9.2 Create Game

Fields:

- Date/time

Behavior:

- Creates a game with status `upcoming`.
- Shows `Game created.` toast.

### 9.3 Game Sections

Each game appears as a collapsible section.

Collapsed header shows:

- Status chip
- Lineup ready/pending chip
- Date/time
- Score summary
- Expand/collapse arrow

Expanded section contains:

- Game details card
- Lineup editor
- Match control
- Events
- Player of the Match

## 10. Admin: Lineup Editor

Lineups are set per game.

The layout has three panels:

- Team A
- Available
- Team B

Primary interaction:

- Drag players from Available into Team A or Team B.
- Drag players back to Available to remove them.

Mobile fallback:

Each player card also has buttons:

- Team A
- Team B
- Out

These allow lineup management on touch devices where drag-and-drop can be awkward.

Position controls:

- `O` for outfield
- `GK` for goalkeeper

Players start with their roster default position, but the admin can override position per game.

### 10.1 Lineup Validation

Before saving, the lineup must be valid.

Rules:

- Team A must have at least 5 players.
- Team B must have at least 5 players.
- Teams may list additional substitutes and do not need equal roster counts.
- Team A cannot have more than one goalkeeper.
- Team B cannot have more than one goalkeeper.

If invalid:

- Validation warnings are shown.
- Save lineup button is disabled.
- If attempted, a toast tells the admin to fix lineup issues.

If valid:

- Shows valid lineup message.
- Admin can save.

After saving:

- Shows `Lineup saved.` toast with countdown bar.
- Lineup editor collapses.
- Saved lineup summary appears.
- Button changes to `Edit lineup`.

Saved lineup summary:

- Team A and Team B cards
- Goalkeeper first
- Then outfield players alphabetically

## 11. Admin: Match Control

Status values:

- `upcoming`
- `draft`
- `live`
- `final`

Expected flow:

```txt
upcoming -> draft -> live -> final
```

Behavior:

- Saving a valid lineup changes an upcoming game to draft.
- Mark live is disabled until a valid saved lineup with at least 5 players per team exists.
- Final is disabled until a valid saved lineup with at least 5 players per team exists.
- Events and POTM are disabled until a valid saved lineup exists.

Feedback:

- Game marked upcoming toast
- Game marked lineup set toast
- Game marked live toast
- Game marked final toast
- Validation toast if the admin tries to change status too early

## 12. Admin: Events

Event types:

- Goal
- Own goal

Fields:

- Event type
- Player
- Assist player, only for normal goals
- Minute, optional

Rules:

- Events require a valid saved lineup.
- Goal can have an optional assist.
- Own goal cannot have an assist.

Score calculation:

- Normal goal counts for the scoring player's team.
- Own goal counts for the opposite team.

Feedback:

- Event added toast
- Event deleted toast

Delete behavior:

- Uses in-app confirmation modal.

### 12.1 Admin: Manual Player Stats

The admin can record stats for any active roster player on a specific game, including someone who joined after the official lineup was saved.

Current stat fields:

- Goals
- Assists
- Saves

Rules:

- One editable stats record exists per player per game.
- A row with zero saves can still record an appearance for a late participant.
- The app automatically uses a lineup player's Team A/B assignment. For a player absent from the official lineup, the admin assigns Team A/B and their outfield/GK role; they then become available as a `Late addition` in the fantasy picker until picks lock.
- Manual goals count for the selected team in the match score. Manual goals, assists, and saves count toward player career totals and fantasy points.
- They are visible on the game detail page and included in player career stats.

Feedback:

- Player stats saved toast

## 13. Admin: Player of the Match

The admin can select POTM from players in the saved lineup.

Rules:

- Requires valid saved lineup.
- Can be empty/null.

Feedback:

- POTM saved toast

Fantasy impact:

- POTM gives +3 fantasy points.

## 14. Fantasy

Route:

```txt
/fantasy
```

Tabs:

- Set Team
- Standings
- History

## 15. Fantasy: Set Team

Available when there is an active fantasy game.

Active fantasy games are games with status:

- `draft`
- `live`

If no active game exists:

- Show empty state.

If a game exists but no lineup exists:

- Show lineup pending empty state.

### 15.1 Lock Clarity

The page shows a status chip:

- `Lineup set - open`
- `Live - locked`
- `Final`

Copy explains whether picks are editable.

Examples:

- Editable until kickoff: date/time
- The game is live. Picks can no longer be changed.
- This game is final. Picks are locked.

### 15.2 Pick Rules

Users pick 5 players total.

If there is a goalkeeper in the lineup:

- 4 outfield
- 1 goalkeeper

If no goalkeeper is in the lineup:

- 5 outfield

Users must select one captain.

Captain doubles total fantasy points for that player.

### 15.3 Pitch Picker

The Set Team screen uses a pitch graphic.

Behavior:

- Tap a slot.
- Choose a player from available lineup pool.
- Assign captain.
- Remove picks if needed.
- Save picks.

After saving:

- Shows `Picks saved.` toast with countdown bar.
- Picker controls collapse.
- Pitch remains visible with saved players.
- Saved picks panel appears.
- Button changes to `Edit picks`.

If game is live/final:

- Picks are read-only.
- Edit button is disabled.

## 16. Fantasy: Standings

Shows:

- All-time fantasy leaderboard
- Top scorers
- Top assists
- Count of users who have not picked yet for the current draft game

There is no season reset in v1. Standings are all-time running totals.

## 17. Fantasy: History

Shows final games, newest first.

For each selected final game:

- Weekly fantasy leaderboard
- Current user pinned/highlighted
- Click any user to view squad breakdown

Squad breakdown includes:

- Player name
- Captain badge if captain
- Points
- Explanation lines for scoring

## 18. Fantasy Scoring

| Item | Points |
| --- | ---: |
| Goal | +4 |
| Assist | +2 |
| Win | +2 |
| Draw | +1 |
| Player of the Match | +3 |
| Clean sheet, goalkeeper only | +4 |
| Every 2 saves, goalkeeper only | +1 |
| Hat-trick bonus, 3+ goals | +3 |
| Own goal | -2 |
| Heavy defeat, losing by 3+ | -1 |
| Captain | Doubles total |

Notes:

- Score and fantasy points recalculate from saved events and lineups.
- Editing/deleting events affects fantasy results automatically after reload/realtime refresh.
- Clean sheet only applies to goalkeepers on final games where their team conceded 0.
- Saves are entered manually by an admin. Eight saves earn four fantasy points; captain doubles the resulting total as usual.

## 19. Data Model

### profiles

Mirrors Supabase Auth users.

Fields:

- `id`
- `username`
- `is_admin`
- `created_at`

The first profile becomes admin automatically.

### players

Real-life roster.

Fields:

- `id`
- `name`
- `default_position`
- `active`
- `created_at`

### games

Match records.

Fields:

- `id`
- `game_date`
- `status`
- `potm_player_id`
- `notes`
- `created_at`

### game_lineups

Players assigned to a game.

Fields:

- `id`
- `game_id`
- `player_id`
- `team`
- `role`
- `created_at`

Constraints:

- One row per player per game.

### events

Match events.

Fields:

- `id`
- `game_id`
- `event_type`
- `player_id`
- `assist_player_id`
- `minute`

### game_player_stats

Manual per-player statistics for one game.

Fields:

- `id`
- `game_id`
- `player_id`
- `team`
- `role`
- `goals`
- `assists`
- `saves`
- `created_at`

The unique `game_id` and `player_id` pair ensures an admin edits the existing stats row instead of creating duplicates.
- `created_at`

Rules:

- Own goals cannot have assist players.

### fantasy_squads

One user squad per game.

Fields:

- `id`
- `user_id`
- `game_id`
- `created_at`
- `updated_at`

Constraints:

- One squad per user per game.

### fantasy_picks

The five picks in a fantasy squad.

Fields:

- `id`
- `squad_id`
- `player_id`
- `role`
- `is_captain`
- `slot_index`
- `created_at`

Constraints:

- One row per picked player per squad.
- One row per slot per squad.
- Only one captain per squad.

## 20. Permissions and RLS

Supabase Row Level Security is enabled on all public tables.

Authenticated users can read:

- profiles
- players
- games
- game_lineups
- events
- fantasy_squads
- fantasy_picks

Only admins can write:

- players
- games
- game_lineups
- events
- profiles updates

Normal users can write:

- Their own fantasy squads
- Their own fantasy picks

Fantasy writes are only allowed when the linked game is:

- upcoming
- draft

Admin access is protected in two layers:

- UI: Admin nav hidden and `/admin` redirects non-admins.
- Database: RLS prevents non-admin writes even if someone tries direct client calls.

## 21. Realtime

The app subscribes to changes for:

- profiles
- players
- games
- game_lineups
- events
- fantasy_squads
- fantasy_picks

When data changes, the app reloads league data so scores, lineups, standings, and fantasy results update.

## 22. Notifications and Dialogs

Toast notification:

- Appears at the bottom of the screen.
- Shows message.
- Has a countdown progress bar.
- Auto-dismisses after a few seconds.

Used for:

- Player added
- Player saved
- Player deleted
- Game created
- Game date saved
- Game deleted
- Game status changed
- Lineup saved
- Event added
- Event deleted
- POTM saved
- Fantasy picks saved
- Error messages from Supabase

Confirm dialog:

- Used for destructive actions.
- Replaces browser confirm popups.

Used for:

- Delete player
- Delete game
- Delete event

## 23. Visual Design

Mood:

- Modern grassroots football.
- Dark UI with turf texture.
- Usable, quick, and match-day friendly.

Palette:

- Turf green: pitch surface and football identity.
- Perimeter blue: borders and structural accents.
- Ink charcoal: backgrounds and panels.
- Chalk white: text and pitch lines.
- Floodlight amber: primary action, captain badge, live emphasis.

Typography:

- Bold display font for headings and sports-style labels.
- Clean sans for normal text.
- Monospace for scores and numbers.

Core visual asset:

- Textured pitch background.
- Used heavily in login, home hero, and fantasy pitch picker.

UI patterns:

- Rounded panels/cards.
- Thin borders.
- Pills for statuses.
- Toasts for feedback.
- In-app modals for destructive confirmation.

## 24. Environment Variables

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Optional:

```env
NEXT_PUBLIC_LEAGUE_INVITE_CODE=your-code-here
```

Notes:

- Restart the dev server after changing env vars.
- In Vercel, add the same env vars in Project Settings.

## 25. Setup Checklist

1. Install dependencies.

```bash
npm install
```

2. Create `.env.local`.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_LEAGUE_INVITE_CODE=
```

3. Run Supabase schema.

Copy all of:

```txt
supabase/schema.sql
```

Paste into Supabase SQL Editor and run once.

4. Disable email confirmation in Supabase Auth.

5. Enable realtime for the relevant tables.

6. Run locally.

```bash
npm run dev
```

7. Create the first account.

The first account becomes admin.

## 26. Deployment

Recommended deployment:

- Supabase for auth, Postgres, RLS, realtime.
- Vercel for Next.js hosting.
- GitHub repository connected to Vercel.

Deployment steps:

1. Push project to GitHub.
2. Import repo into Vercel.
3. Add env vars in Vercel.
4. Deploy.
5. Confirm Supabase URL and anon key are correct.

## 27. Known Constraints

- The invite code is client-visible because it is a `NEXT_PUBLIC_` value.
- Admin is single-admin by default: first account only.
- No season reset yet.
- No team auto-balancer yet.
- No server-side invite management yet.
- No push notifications yet.
- No offline support.

## 28. Future Ideas

- Server-side invite codes.
- Multiple admins.
- Seasons.
- Auto team balancer.
- Prediction game.
- Attendance tracking.
- Head-to-head rivalry stats.
- Player profile detail pages.
- Export/share weekly fantasy results.
- Better mobile-specific pitch picker gestures.
- Game result social card image.

