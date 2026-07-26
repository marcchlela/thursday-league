-- Local development data for Thursday League.
-- This file is executed after migrations by `supabase db reset --local`.
-- All accounts and passwords below are disposable and must never be used in production.

begin;

-- Keep one previous season so seasonal and all-time views can both be exercised.
insert into public.seasons(id, name, format, start_date, end_date)
values (
  '10000000-0000-4000-8000-000000000002',
  (extract(year from current_date)::integer - 1)::text,
  'yearly',
  make_date(extract(year from current_date)::integer - 1, 1, 1),
  make_date(extract(year from current_date)::integer - 1, 12, 31)
)
on conflict (format, start_date, end_date) do nothing;

update public.league_settings
set current_season_id = (
  select id
  from public.seasons
  where format = 'yearly'
    and current_date between start_date and end_date
  order by start_date desc
  limit 1
);

-- Password for every seeded login: LocalTest123!
-- The app derives these local emails from the username and local Supabase hostname.
insert into auth.users(
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  seed_user.id,
  'authenticated',
  'authenticated',
  seed_user.username || '@127.0.0.1',
  crypt('LocalTest123!', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object(
    'sub', seed_user.id,
    'email', seed_user.username || '@127.0.0.1',
    'username', seed_user.username,
    'email_verified', true,
    'phone_verified', false
  ),
  now(),
  now()
from (values
  ('20000000-0000-4000-8000-000000000001'::uuid, 'marcos'),
  ('20000000-0000-4000-8000-000000000002'::uuid, 'alex'),
  ('20000000-0000-4000-8000-000000000003'::uuid, 'maya'),
  ('20000000-0000-4000-8000-000000000004'::uuid, 'sam'),
  ('20000000-0000-4000-8000-000000000005'::uuid, 'lina'),
  ('20000000-0000-4000-8000-000000000006'::uuid, 'omar')
) as seed_user(id, username);

insert into auth.identities(
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  ('21000000-0000-4000-8000-' || right(seed_user.id::text, 12))::uuid,
  seed_user.id::text,
  seed_user.id,
  jsonb_build_object(
    'sub', seed_user.id,
    'email', seed_user.username || '@127.0.0.1',
    'username', seed_user.username,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
from (values
  ('20000000-0000-4000-8000-000000000001'::uuid, 'marcos'),
  ('20000000-0000-4000-8000-000000000002'::uuid, 'alex'),
  ('20000000-0000-4000-8000-000000000003'::uuid, 'maya'),
  ('20000000-0000-4000-8000-000000000004'::uuid, 'sam'),
  ('20000000-0000-4000-8000-000000000005'::uuid, 'lina'),
  ('20000000-0000-4000-8000-000000000006'::uuid, 'omar')
) as seed_user(id, username);

update public.profiles
set is_admin = (id = '20000000-0000-4000-8000-000000000001')
where id::text like '20000000-0000-4000-8000-%';

update public.notification_preferences
set fantasy_reminder_minutes = case
      when user_id = '20000000-0000-4000-8000-000000000003' then 60
      else 120
    end,
    announcements = user_id <> '20000000-0000-4000-8000-000000000006'
where user_id::text like '20000000-0000-4000-8000-%';

insert into public.players(
  id,
  name,
  default_position,
  active,
  player_type,
  fantasy_eligible,
  individual_betting_eligible
)
values
  ('30000000-0000-4000-8000-000000000001', 'Karim Haddad', 'goalkeeper', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000002', 'Daniel Nassar', 'goalkeeper', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000003', 'Marc Saad', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000004', 'Rami Khoury', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000005', 'Jad Mansour', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000006', 'Anthony Elias', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000007', 'Omar Farah', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000008', 'Nabil Younes', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000009', 'Tarek Saliba', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000010', 'Fadi Karam', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000011', 'Sami Daher', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000012', 'Joe Habib', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000013', 'Ziad Aoun', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000014', 'Eli Hanna', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000015', 'Nicolas Azar', 'outfield', true, 'regular', true, true),
  ('30000000-0000-4000-8000-000000000016', 'Anonymous Guest', 'outfield', true, 'guest', false, false);

-- Games are relative to the reset date so there is always a useful upcoming match.
insert into public.games(
  id,
  game_date,
  status,
  potm_player_id,
  notes,
  season_id,
  team_a_goalkeeper_mode,
  team_b_goalkeeper_mode
)
values
  (
    '40000000-0000-4000-8000-000000000000',
    make_timestamptz(extract(year from current_date)::integer - 1, 12, 18, 20, 30, 0, 'Asia/Beirut'),
    'draft',
    '30000000-0000-4000-8000-000000000011',
    'Previous-season test match',
    '10000000-0000-4000-8000-000000000002',
    'fixed',
    'fixed'
  ),
  (
    '40000000-0000-4000-8000-000000000001',
    ((date_trunc('week', now() at time zone 'Asia/Beirut') + interval '10 days 20 hours 30 minutes') at time zone 'Asia/Beirut') - interval '28 days',
    'draft',
    '30000000-0000-4000-8000-000000000003',
    'Balanced fixed-goalkeeper match',
    (select current_season_id from public.league_settings where id = 1),
    'fixed',
    'fixed'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    ((date_trunc('week', now() at time zone 'Asia/Beirut') + interval '10 days 20 hours 30 minutes') at time zone 'Asia/Beirut') - interval '21 days',
    'draft',
    '30000000-0000-4000-8000-000000000005',
    'Team A used a rotating goalkeeper',
    (select current_season_id from public.league_settings where id = 1),
    'rotating',
    'fixed'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    ((date_trunc('week', now() at time zone 'Asia/Beirut') + interval '10 days 20 hours 30 minutes') at time zone 'Asia/Beirut') - interval '14 days',
    'draft',
    '30000000-0000-4000-8000-000000000003',
    'Team B used a rotating goalkeeper',
    (select current_season_id from public.league_settings where id = 1),
    'fixed',
    'rotating'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    ((date_trunc('week', now() at time zone 'Asia/Beirut') + interval '10 days 20 hours 30 minutes') at time zone 'Asia/Beirut') - interval '7 days',
    'draft',
    '30000000-0000-4000-8000-000000000009',
    'Both teams rotated in goal; guest player included',
    (select current_season_id from public.league_settings where id = 1),
    'rotating',
    'rotating'
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    ((date_trunc('week', now() at time zone 'Asia/Beirut') + interval '10 days 20 hours 30 minutes') at time zone 'Asia/Beirut'),
    'upcoming',
    null,
    'Upcoming local test match',
    (select current_season_id from public.league_settings where id = 1),
    'fixed',
    'rotating'
  );

insert into public.game_lineups(game_id, player_id, team, role, slot_index)
values
  -- Previous season
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000002', 'A', 'goalkeeper', 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000006', 'A', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000011', 'A', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000014', 'A', 'outfield', 4),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000001', 'B', 'goalkeeper', 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000004', 'B', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000005', 'B', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000008', 'B', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000013', 'B', 'outfield', 4),
  -- Current game 1: fixed/fixed
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'A', 'goalkeeper', 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'A', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', 'A', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'A', 'outfield', 4),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'B', 'goalkeeper', 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000007', 'B', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000008', 'B', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000009', 'B', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000010', 'B', 'outfield', 4),
  -- Current game 2: rotating/fixed
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'A', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'A', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000011', 'A', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'A', 'outfield', 4),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'B', 'goalkeeper', 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'B', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'B', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000008', 'B', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'B', 'outfield', 4),
  -- Current game 3: fixed/rotating
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'A', 'goalkeeper', 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004', 'A', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000006', 'A', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000009', 'A', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000014', 'A', 'outfield', 4),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'B', 'outfield', 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000005', 'B', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000007', 'B', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000010', 'B', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000015', 'B', 'outfield', 4),
  -- Current game 4: rotating/rotating with guest
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'A', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000008', 'A', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000012', 'A', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000016', 'A', 'outfield', 4),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000005', 'B', 'outfield', 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000006', 'B', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000009', 'B', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000011', 'B', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000013', 'B', 'outfield', 4),
  -- Upcoming: fixed/rotating
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002', 'A', 'goalkeeper', 0),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000007', 'A', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000010', 'A', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000014', 'A', 'outfield', 4),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000004', 'B', 'outfield', 0),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', 'B', 'outfield', 1),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000008', 'B', 'outfield', 2),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000011', 'B', 'outfield', 3),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000015', 'B', 'outfield', 4);

insert into public.game_player_stats(
  game_id,
  player_id,
  team,
  role,
  goals,
  assists,
  saves,
  own_goals
)
values
  -- Previous season: Team A 3-2 Team B
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000002', 'A', 'goalkeeper', 0, 0, 5, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000006', 'A', 'outfield', 1, 0, 0, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000011', 'A', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000014', 'A', 'outfield', 0, 0, 0, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000001', 'B', 'goalkeeper', 0, 0, 6, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000004', 'B', 'outfield', 1, 0, 0, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000005', 'B', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000008', 'B', 'outfield', 0, 0, 0, 0),
  ('40000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000013', 'B', 'outfield', 0, 0, 0, 0),
  -- Current game 1: 5-4
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'A', 'goalkeeper', 0, 0, 5, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 2, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'A', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', 'A', 'outfield', 2, 0, 0, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'A', 'outfield', 0, 2, 0, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'B', 'goalkeeper', 0, 0, 6, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000007', 'B', 'outfield', 2, 0, 0, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000008', 'B', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000009', 'B', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000010', 'B', 'outfield', 0, 1, 0, 0),
  -- Current game 2: 7-5
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 2, 1, 1, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'A', 'outfield', 2, 1, 2, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'A', 'outfield', 1, 2, 1, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000011', 'A', 'outfield', 1, 1, 2, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'A', 'outfield', 1, 0, 1, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'B', 'goalkeeper', 0, 0, 8, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'B', 'outfield', 2, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'B', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000008', 'B', 'outfield', 1, 2, 0, 0),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'B', 'outfield', 1, 0, 0, 0),
  -- Current game 3: 3-6, including one Team A own goal
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'A', 'goalkeeper', 0, 0, 7, 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004', 'A', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000006', 'A', 'outfield', 1, 0, 0, 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000009', 'A', 'outfield', 1, 1, 0, 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000014', 'A', 'outfield', 0, 0, 0, 1),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'B', 'outfield', 2, 1, 1, 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000005', 'B', 'outfield', 1, 2, 2, 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000007', 'B', 'outfield', 1, 1, 2, 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000010', 'B', 'outfield', 1, 0, 1, 0),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000015', 'B', 'outfield', 0, 1, 1, 0),
  -- Current game 4: 6-6, saves distributed across rotating keepers
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 'A', 'outfield', 2, 1, 1, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'A', 'outfield', 1, 2, 2, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000008', 'A', 'outfield', 1, 1, 1, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000012', 'A', 'outfield', 1, 1, 1, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000016', 'A', 'outfield', 1, 0, 2, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000005', 'B', 'outfield', 2, 0, 2, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000006', 'B', 'outfield', 1, 1, 1, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000009', 'B', 'outfield', 1, 2, 2, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000011', 'B', 'outfield', 1, 1, 1, 0),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000013', 'B', 'outfield', 1, 1, 2, 0);

-- Historical squads for every user; fake users also have upcoming picks.
insert into public.fantasy_squads(user_id, game_id, created_at, updated_at)
select
  profile.id,
  game.id,
  game.game_date - interval '2 days',
  game.game_date - interval '2 days'
from public.profiles profile
cross join public.games game
where profile.id::text like '20000000-0000-4000-8000-%'
  and (
    game.status = 'draft'
    or profile.id <> '20000000-0000-4000-8000-000000000001'
  );

with eligible_lineups as (
  select
    squad.id as squad_id,
    squad.user_id,
    lineup.player_id,
    lineup.role,
    row_number() over (
      partition by squad.id, lineup.role
      order by md5(squad.user_id::text || lineup.player_id::text)
    ) as role_rank,
    count(*) filter (where lineup.role = 'goalkeeper') over (
      partition by squad.id
    ) as goalkeeper_count
  from public.fantasy_squads squad
  join public.game_lineups lineup on lineup.game_id = squad.game_id
  join public.players player on player.id = lineup.player_id
  where player.fantasy_eligible
),
selected as (
  select *
  from eligible_lineups
  where (role = 'goalkeeper' and role_rank = 1)
     or (
       role = 'outfield'
       and role_rank <= case when goalkeeper_count > 0 then 4 else 5 end
     )
),
ranked as (
  select
    selected.*,
    row_number() over (
      partition by squad_id
      order by case when role = 'goalkeeper' then 0 else 1 end, md5(user_id::text || player_id::text)
    ) - 1 as slot_index,
    row_number() over (
      partition by squad_id
      order by case when role = 'outfield' then 0 else 1 end, md5('captain' || user_id::text || player_id::text)
    ) as captain_rank
  from selected
)
insert into public.fantasy_picks(squad_id, player_id, role, is_captain, slot_index)
select squad_id, player_id, role, captain_rank = 1, slot_index
from ranked;

insert into public.odds_generation_runs(id, game_id, model_version, input_snapshot, generated_by)
values
  (
    '52000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003',
    'local-seed-v1',
    '{"source":"local_seed","expected_goals_A":3.8,"expected_goals_B":5.2}',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '52000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000004',
    'local-seed-v1',
    '{"source":"local_seed","expected_goals_A":5.5,"expected_goals_B":5.3}',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '52000000-0000-4000-8000-000000000005',
    '40000000-0000-4000-8000-000000000005',
    'local-seed-v1',
    '{"source":"local_seed","expected_goals_A":4.7,"expected_goals_B":4.6}',
    '20000000-0000-4000-8000-000000000001'
  );

insert into public.betting_markets(
  id,
  game_id,
  generation_run_id,
  market_key,
  market_type,
  title,
  subject_player_id,
  subject_team,
  line,
  status
)
values
  -- Settled game 3
  ('50000000-0000-4000-8000-000000000301', '40000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000003', 'result', 'match_result', 'Match result', null, null, null, 'open'),
  ('50000000-0000-4000-8000-000000000302', '40000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000003', 'total-7.5', 'total_goals', 'Total goals', null, null, 7.5, 'open'),
  ('50000000-0000-4000-8000-000000000303', '40000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000003', 'marc-goals-0.5', 'player_goals', 'Marc Saad goals', '30000000-0000-4000-8000-000000000003', null, 0.5, 'open'),
  ('50000000-0000-4000-8000-000000000304', '40000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000003', 'own-goal', 'own_goal', 'Any own goal', null, null, null, 'open'),
  ('50000000-0000-4000-8000-000000000305', '40000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000003', 'team-a-saves-5.5', 'team_saves', 'Team A total saves', null, 'A', 5.5, 'open'),
  -- Settled game 4
  ('50000000-0000-4000-8000-000000000401', '40000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000004', 'result', 'match_result', 'Match result', null, null, null, 'open'),
  ('50000000-0000-4000-8000-000000000402', '40000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000004', 'total-9.5', 'total_goals', 'Total goals', null, null, 9.5, 'open'),
  ('50000000-0000-4000-8000-000000000403', '40000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000004', 'marc-goals-0.5', 'player_goals', 'Marc Saad goals', '30000000-0000-4000-8000-000000000003', null, 0.5, 'open'),
  ('50000000-0000-4000-8000-000000000404', '40000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000004', 'own-goal', 'own_goal', 'Any own goal', null, null, null, 'open'),
  ('50000000-0000-4000-8000-000000000405', '40000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000004', 'team-a-saves-5.5', 'team_saves', 'Team A total saves', null, 'A', 5.5, 'open'),
  -- Upcoming game
  ('50000000-0000-4000-8000-000000000501', '40000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000005', 'result', 'match_result', 'Match result', null, null, null, 'open'),
  ('50000000-0000-4000-8000-000000000502', '40000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000005', 'total-8.5', 'total_goals', 'Total goals', null, null, 8.5, 'open'),
  ('50000000-0000-4000-8000-000000000503', '40000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000005', 'marc-goals-0.5', 'player_goals', 'Marc Saad goals', '30000000-0000-4000-8000-000000000003', null, 0.5, 'open'),
  ('50000000-0000-4000-8000-000000000504', '40000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000005', 'omar-assists-0.5', 'player_assists', 'Omar Farah assists', '30000000-0000-4000-8000-000000000007', null, 0.5, 'open'),
  ('50000000-0000-4000-8000-000000000505', '40000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000005', 'daniel-saves-5.5', 'goalkeeper_saves', 'Daniel Nassar saves', '30000000-0000-4000-8000-000000000002', null, 5.5, 'open'),
  ('50000000-0000-4000-8000-000000000506', '40000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000005', 'team-b-saves-5.5', 'team_saves', 'Team B total saves', null, 'B', 5.5, 'open'),
  ('50000000-0000-4000-8000-000000000507', '40000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000005', 'own-goal', 'own_goal', 'Any own goal', null, null, null, 'open');

insert into public.betting_outcomes(
  id,
  market_id,
  outcome_key,
  label,
  fair_probability,
  offered_odds
)
values
  -- Game 3
  ('51000000-0000-4000-8000-000000000301', '50000000-0000-4000-8000-000000000301', 'A', 'Team A', 0.32, 2.94),
  ('51000000-0000-4000-8000-000000000302', '50000000-0000-4000-8000-000000000301', 'draw', 'Draw', 0.18, 5.22),
  ('51000000-0000-4000-8000-000000000303', '50000000-0000-4000-8000-000000000301', 'B', 'Team B', 0.50, 1.88),
  ('51000000-0000-4000-8000-000000000304', '50000000-0000-4000-8000-000000000302', 'over', 'Over 7.5', 0.62, 1.52),
  ('51000000-0000-4000-8000-000000000305', '50000000-0000-4000-8000-000000000302', 'under', 'Under 7.5', 0.38, 2.47),
  ('51000000-0000-4000-8000-000000000306', '50000000-0000-4000-8000-000000000303', 'over', 'Over 0.5', 0.55, 1.71),
  ('51000000-0000-4000-8000-000000000307', '50000000-0000-4000-8000-000000000303', 'under', 'Under 0.5', 0.45, 2.09),
  ('51000000-0000-4000-8000-000000000308', '50000000-0000-4000-8000-000000000304', 'yes', 'Yes', 0.16, 5.88),
  ('51000000-0000-4000-8000-000000000309', '50000000-0000-4000-8000-000000000304', 'no', 'No', 0.84, 1.12),
  ('51000000-0000-4000-8000-000000000310', '50000000-0000-4000-8000-000000000305', 'over', 'Over 5.5', 0.52, 1.81),
  ('51000000-0000-4000-8000-000000000311', '50000000-0000-4000-8000-000000000305', 'under', 'Under 5.5', 0.48, 1.96),
  -- Game 4
  ('51000000-0000-4000-8000-000000000401', '50000000-0000-4000-8000-000000000401', 'A', 'Team A', 0.41, 2.29),
  ('51000000-0000-4000-8000-000000000402', '50000000-0000-4000-8000-000000000401', 'draw', 'Draw', 0.18, 5.22),
  ('51000000-0000-4000-8000-000000000403', '50000000-0000-4000-8000-000000000401', 'B', 'Team B', 0.41, 2.29),
  ('51000000-0000-4000-8000-000000000404', '50000000-0000-4000-8000-000000000402', 'over', 'Over 9.5', 0.57, 1.65),
  ('51000000-0000-4000-8000-000000000405', '50000000-0000-4000-8000-000000000402', 'under', 'Under 9.5', 0.43, 2.19),
  ('51000000-0000-4000-8000-000000000406', '50000000-0000-4000-8000-000000000403', 'over', 'Over 0.5', 0.58, 1.62),
  ('51000000-0000-4000-8000-000000000407', '50000000-0000-4000-8000-000000000403', 'under', 'Under 0.5', 0.42, 2.24),
  ('51000000-0000-4000-8000-000000000408', '50000000-0000-4000-8000-000000000404', 'yes', 'Yes', 0.14, 6.71),
  ('51000000-0000-4000-8000-000000000409', '50000000-0000-4000-8000-000000000404', 'no', 'No', 0.86, 1.09),
  ('51000000-0000-4000-8000-000000000410', '50000000-0000-4000-8000-000000000405', 'over', 'Over 5.5', 0.54, 1.74),
  ('51000000-0000-4000-8000-000000000411', '50000000-0000-4000-8000-000000000405', 'under', 'Under 5.5', 0.46, 2.04),
  -- Upcoming game
  ('51000000-0000-4000-8000-000000000501', '50000000-0000-4000-8000-000000000501', 'A', 'Team A', 0.42, 2.23),
  ('51000000-0000-4000-8000-000000000502', '50000000-0000-4000-8000-000000000501', 'draw', 'Draw', 0.16, 5.88),
  ('51000000-0000-4000-8000-000000000503', '50000000-0000-4000-8000-000000000501', 'B', 'Team B', 0.42, 2.23),
  ('51000000-0000-4000-8000-000000000504', '50000000-0000-4000-8000-000000000502', 'over', 'Over 8.5', 0.55, 1.71),
  ('51000000-0000-4000-8000-000000000505', '50000000-0000-4000-8000-000000000502', 'under', 'Under 8.5', 0.45, 2.09),
  ('51000000-0000-4000-8000-000000000506', '50000000-0000-4000-8000-000000000503', 'over', 'Over 0.5', 0.48, 1.96),
  ('51000000-0000-4000-8000-000000000507', '50000000-0000-4000-8000-000000000503', 'under', 'Under 0.5', 0.52, 1.81),
  ('51000000-0000-4000-8000-000000000508', '50000000-0000-4000-8000-000000000504', 'over', 'Over 0.5', 0.36, 2.61),
  ('51000000-0000-4000-8000-000000000509', '50000000-0000-4000-8000-000000000504', 'under', 'Under 0.5', 0.64, 1.47),
  ('51000000-0000-4000-8000-000000000510', '50000000-0000-4000-8000-000000000505', 'over', 'Over 5.5', 0.52, 1.81),
  ('51000000-0000-4000-8000-000000000511', '50000000-0000-4000-8000-000000000505', 'under', 'Under 5.5', 0.48, 1.96),
  ('51000000-0000-4000-8000-000000000512', '50000000-0000-4000-8000-000000000506', 'over', 'Over 5.5', 0.50, 1.88),
  ('51000000-0000-4000-8000-000000000513', '50000000-0000-4000-8000-000000000506', 'under', 'Under 5.5', 0.50, 1.88),
  ('51000000-0000-4000-8000-000000000514', '50000000-0000-4000-8000-000000000507', 'yes', 'Yes', 0.12, 7.83),
  ('51000000-0000-4000-8000-000000000515', '50000000-0000-4000-8000-000000000507', 'no', 'No', 0.88, 1.07);

-- Small helper used only in this seed session. It records realistic stakes and
-- lets the normal settlement function calculate wins, losses and payouts.
create or replace function public.seed_local_bet_slip(
  target_user_id uuid,
  target_game_id uuid,
  selected_outcome_ids uuid[],
  target_stake_units integer,
  target_request_id uuid
)
returns uuid
language plpgsql
as $$
declare
  target_wallet public.betting_wallets%rowtype;
  target_game public.games%rowtype;
  target_outcome record;
  selected_outcome_id uuid;
  created_slip_id uuid;
  outcome_count integer := 0;
  product_odds numeric := 1;
  accepted_total_odds numeric;
  builder_margin_value numeric;
  balance_after bigint;
begin
  select * into target_game from public.games where id = target_game_id;
  select * into target_wallet
  from public.betting_wallets
  where user_id = target_user_id and season_id = target_game.season_id
  for update;

  foreach selected_outcome_id in array selected_outcome_ids
  loop
    select
      outcome.id,
      outcome.market_id,
      outcome.offered_odds,
      outcome.fair_probability
    into target_outcome
    from public.betting_outcomes outcome
    where outcome.id = selected_outcome_id;
    outcome_count := outcome_count + 1;
    product_odds := product_odds * target_outcome.offered_odds;
  end loop;

  select builder_margin into builder_margin_value from public.betting_settings where id = 1;
  accepted_total_odds := round(
    case
      when outcome_count = 1 then product_odds
      else 1 + (product_odds - 1) * (1 - builder_margin_value)
    end,
    4
  );

  insert into public.bet_slips(
    user_id,
    wallet_id,
    game_id,
    season_id,
    slip_type,
    stake_units,
    accepted_odds,
    potential_payout_units,
    status,
    request_id,
    placed_at
  )
  values (
    target_user_id,
    target_wallet.id,
    target_game_id,
    target_game.season_id,
    case when outcome_count = 1 then 'single' else 'builder' end,
    target_stake_units,
    accepted_total_odds,
    round(target_stake_units * accepted_total_odds),
    'pending',
    target_request_id,
    target_game.game_date - interval '2 days'
  )
  returning id into created_slip_id;

  foreach selected_outcome_id in array selected_outcome_ids
  loop
    select
      outcome.id,
      outcome.market_id,
      outcome.offered_odds,
      outcome.fair_probability
    into target_outcome
    from public.betting_outcomes outcome
    where outcome.id = selected_outcome_id;
    insert into public.bet_legs(
      slip_id,
      market_id,
      outcome_id,
      accepted_odds,
      fair_probability
    )
    values (
      created_slip_id,
      target_outcome.market_id,
      target_outcome.id,
      target_outcome.offered_odds,
      target_outcome.fair_probability
    );
  end loop;

  update public.betting_wallets
  set balance_units = balance_units - target_stake_units,
      updated_at = now()
  where id = target_wallet.id
  returning balance_units into balance_after;

  insert into public.coin_ledger(
    wallet_id,
    slip_id,
    entry_type,
    amount_units,
    balance_after_units,
    idempotency_key,
    metadata,
    created_at
  )
  values (
    target_wallet.id,
    created_slip_id,
    'stake',
    -target_stake_units,
    balance_after,
    'seed-stake:' || target_request_id::text,
    jsonb_build_object('game_id', target_game_id, 'source', 'local_seed'),
    target_game.game_date - interval '2 days'
  );
  return created_slip_id;
end;
$$;

-- Bets for the two most recent completed matches.
do $seed_bets$
begin
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', array['51000000-0000-4000-8000-000000000303'::uuid], 1000, '60000000-0000-4000-8000-000000000301');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', array['51000000-0000-4000-8000-000000000301'::uuid], 700, '60000000-0000-4000-8000-000000000302');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', array['51000000-0000-4000-8000-000000000304'::uuid], 900, '60000000-0000-4000-8000-000000000303');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000003', array['51000000-0000-4000-8000-000000000303'::uuid, '51000000-0000-4000-8000-000000000308'::uuid], 500, '60000000-0000-4000-8000-000000000304');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000003', array['51000000-0000-4000-8000-000000000306'::uuid], 600, '60000000-0000-4000-8000-000000000305');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000003', array['51000000-0000-4000-8000-000000000305'::uuid], 800, '60000000-0000-4000-8000-000000000306');

  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', array['51000000-0000-4000-8000-000000000402'::uuid], 800, '60000000-0000-4000-8000-000000000401');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004', array['51000000-0000-4000-8000-000000000404'::uuid], 1000, '60000000-0000-4000-8000-000000000402');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000004', array['51000000-0000-4000-8000-000000000406'::uuid], 750, '60000000-0000-4000-8000-000000000403');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', array['51000000-0000-4000-8000-000000000409'::uuid], 900, '60000000-0000-4000-8000-000000000404');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000004', array['51000000-0000-4000-8000-000000000410'::uuid], 500, '60000000-0000-4000-8000-000000000405');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000004', array['51000000-0000-4000-8000-000000000402'::uuid, '51000000-0000-4000-8000-000000000404'::uuid], 1200, '60000000-0000-4000-8000-000000000406');

-- Pending upcoming bets belong to fake users so marcos can test placing a new bet.
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000005', array['51000000-0000-4000-8000-000000000501'::uuid], 600, '60000000-0000-4000-8000-000000000501');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000005', array['51000000-0000-4000-8000-000000000504'::uuid], 800, '60000000-0000-4000-8000-000000000502');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000005', array['51000000-0000-4000-8000-000000000506'::uuid], 500, '60000000-0000-4000-8000-000000000503');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', array['51000000-0000-4000-8000-000000000508'::uuid], 700, '60000000-0000-4000-8000-000000000504');
  perform public.seed_local_bet_slip('20000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000005', array['51000000-0000-4000-8000-000000000503'::uuid, '51000000-0000-4000-8000-000000000505'::uuid], 900, '60000000-0000-4000-8000-000000000505');
end;
$seed_bets$;

drop function public.seed_local_bet_slip(uuid, uuid, uuid[], integer, uuid);

insert into public.notification_dispatches(
  notification_type,
  game_id,
  title,
  body,
  target_url,
  tag,
  source,
  dedupe_key,
  created_by
)
values (
  'announcement',
  '40000000-0000-4000-8000-000000000005',
  'Local test league ready',
  'The upcoming match, Fantasy squads and betting markets are ready to test.',
  '/games/40000000-0000-4000-8000-000000000005',
  'local-seed',
  'admin',
  'local-seed-announcement',
  '20000000-0000-4000-8000-000000000001'
);

-- Finalization creates immutable result versions, settles bets and writes audit history.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select public.set_game_status('40000000-0000-4000-8000-000000000000', 'final');
select public.set_game_status('40000000-0000-4000-8000-000000000001', 'final');
select public.set_game_status('40000000-0000-4000-8000-000000000002', 'final');
select public.set_game_status('40000000-0000-4000-8000-000000000003', 'final');
select public.set_game_status('40000000-0000-4000-8000-000000000004', 'final');

commit;
