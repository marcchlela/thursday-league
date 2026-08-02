-- Platform-owner notification copy and safe in-app destinations.
-- The browser cannot read or write this table directly; all access goes through
-- a server route that re-verifies the caller's active platform_admin role.

create table public.platform_notification_templates (
  notification_type text primary key check (notification_type in (
    'new_game',
    'lineups_ready',
    'final_results',
    'fantasy_deadline',
    'join_request',
    'join_approved',
    'betting_unlocked',
    'matchday_reminder'
  )),
  enabled boolean not null default true,
  title_template text not null check (char_length(title_template) between 2 and 60),
  body_template text not null check (char_length(body_template) between 2 and 180),
  destination text not null check (destination in (
    'league_home', 'games', 'game', 'fantasy', 'betting', 'league_members'
  )),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_notification_template_destination_check check (
    (notification_type = 'new_game' and destination in ('game', 'games', 'league_home'))
    or (notification_type = 'lineups_ready' and destination in ('fantasy', 'game', 'games', 'league_home'))
    or (notification_type = 'final_results' and destination in ('game', 'games', 'fantasy', 'league_home'))
    or (notification_type = 'fantasy_deadline' and destination in ('fantasy', 'game', 'games', 'league_home'))
    or (notification_type = 'join_request' and destination in ('league_members', 'league_home'))
    or (notification_type = 'join_approved' and destination in ('league_home', 'games'))
    or (notification_type = 'betting_unlocked' and destination in ('betting', 'league_home', 'games'))
    or (notification_type = 'matchday_reminder' and destination in ('game', 'games', 'league_home'))
  )
);

drop trigger if exists platform_notification_templates_touch_updated_at
  on public.platform_notification_templates;
create trigger platform_notification_templates_touch_updated_at
before update on public.platform_notification_templates
for each row execute function public.touch_updated_at();

alter table public.platform_notification_templates enable row level security;

-- Defense in depth: not even a platform admin accesses templates from the
-- browser client. The server authenticates and authorizes every request, then
-- uses the service role for the narrow read/update operation.
revoke all on public.platform_notification_templates from public, anon, authenticated;
grant select, insert, update on public.platform_notification_templates to service_role;

insert into public.platform_notification_templates(
  notification_type,
  enabled,
  title_template,
  body_template,
  destination
)
values
  ('new_game', true, 'New game', 'A new game was scheduled in {league_name}. Tap to see kickoff in your local time.', 'game'),
  ('lineups_ready', true, 'Lineups ready', 'The lineups are confirmed in {league_name}. Fantasy is open—tap to make your picks.', 'fantasy'),
  ('final_results', true, 'Final result', 'Team A {team_a_score}-{team_b_score} Team B in {league_name}. Tap to see the match and Fantasy results.', 'game'),
  ('fantasy_deadline', true, 'Fantasy deadline', 'Your {league_name} team is not saved yet. Tap to make your picks before kickoff.', 'fantasy'),
  ('join_request', true, 'New join request', '{username} requested to join {league_name}.', 'league_members'),
  ('join_approved', true, 'You joined {league_name}', '{admin_name} accepted your request. Tap to open the league.', 'league_home'),
  ('betting_unlocked', true, 'Betting unlocked', '{required_games} games are complete. Virtual betting is now open in {league_name}.', 'betting'),
  ('matchday_reminder', true, 'It''s matchday!', 'There is a {league_name} game today. Tap to see kickoff in your local time.', 'game')
on conflict (notification_type) do nothing;
