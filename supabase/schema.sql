-- Thursday League database schema
-- Run this in Supabase SQL Editor once.

create extension if not exists pgcrypto;

-- Enums. Supabase/Postgres does not support CREATE TYPE IF NOT EXISTS for enums everywhere,
-- so each enum is created safely inside a duplicate_object guard.
do $$ begin
  create type player_position as enum ('goalkeeper', 'outfield');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type team_code as enum ('A', 'B');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type game_status as enum ('upcoming', 'draft', 'live', 'final');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type event_kind as enum ('goal', 'own_goal');
exception when duplicate_object then null;
end $$;

-- Profiles mirror Supabase Auth users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 32),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  default_position player_position not null default 'outfield',
  active boolean not null default true,
  competition_eligible boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  game_date timestamptz not null,
  status game_status not null default 'upcoming',
  potm_player_id uuid references public.players(id) on delete set null,
  notes text,
  finalized_at timestamptz,
  correction_open boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.game_lineups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  team team_code not null,
  role player_position not null default 'outfield',
  slot_index integer check (slot_index is null or slot_index between 0 and 4),
  created_at timestamptz not null default now(),
  unique (game_id, player_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  event_type event_kind not null,
  player_id uuid not null references public.players(id) on delete restrict,
  assist_player_id uuid references public.players(id) on delete set null,
  minute integer check (minute is null or minute between 0 and 200),
  created_at timestamptz not null default now(),
  check (
    (event_type = 'goal') or (event_type = 'own_goal' and assist_player_id is null)
  )
);

create table if not exists public.game_player_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  team team_code not null default 'A',
  role player_position not null default 'outfield',
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  saves integer not null default 0 check (saves >= 0),
  created_at timestamptz not null default now(),
  unique (game_id, player_id)
);

create table if not exists public.fantasy_squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create table if not exists public.fantasy_picks (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.fantasy_squads(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  role player_position not null default 'outfield',
  is_captain boolean not null default false,
  slot_index integer not null check (slot_index between 0 and 4),
  created_at timestamptz not null default now(),
  unique (squad_id, player_id),
  unique (squad_id, slot_index)
);

create unique index if not exists one_captain_per_squad
  on public.fantasy_picks(squad_id)
  where is_captain = true;

-- Utility functions
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
$$;

create or replace function public.squad_is_own_and_unlocked(target_squad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fantasy_squads s
    join public.games g on g.id = s.game_id
    where s.id = target_squad_id
      and s.user_id = auth.uid()
      and g.status in ('upcoming', 'draft')
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fantasy_squads_touch_updated_at on public.fantasy_squads;
create trigger fantasy_squads_touch_updated_at
before update on public.fantasy_squads
for each row execute function public.touch_updated_at();

-- First Supabase Auth user becomes admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_username text;
  should_be_admin boolean;
begin
  chosen_username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  should_be_admin := not exists (select 1 from public.profiles);

  insert into public.profiles (id, username, is_admin)
  values (new.id, lower(regexp_replace(chosen_username, '[^a-zA-Z0-9_]+', '', 'g')), should_be_admin);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_lineups enable row level security;
alter table public.events enable row level security;
alter table public.game_player_stats enable row level security;
alter table public.fantasy_squads enable row level security;
alter table public.fantasy_picks enable row level security;

-- Re-runnable policy setup.
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "players readable" on public.players;
drop policy if exists "games readable" on public.games;
drop policy if exists "lineups readable" on public.game_lineups;
drop policy if exists "events readable" on public.events;
drop policy if exists "game player stats readable" on public.game_player_stats;
drop policy if exists "fantasy squads readable" on public.fantasy_squads;
drop policy if exists "fantasy picks readable" on public.fantasy_picks;
drop policy if exists "profiles admin update" on public.profiles;
drop policy if exists "admins insert players" on public.players;
drop policy if exists "admins update players" on public.players;
drop policy if exists "admins delete players" on public.players;
drop policy if exists "admins insert games" on public.games;
drop policy if exists "admins update games" on public.games;
drop policy if exists "admins delete games" on public.games;
drop policy if exists "admins insert lineups" on public.game_lineups;
drop policy if exists "admins update lineups" on public.game_lineups;
drop policy if exists "admins delete lineups" on public.game_lineups;
drop policy if exists "admins insert events" on public.events;
drop policy if exists "admins update events" on public.events;
drop policy if exists "admins delete events" on public.events;
drop policy if exists "admins insert game player stats" on public.game_player_stats;
drop policy if exists "admins update game player stats" on public.game_player_stats;
drop policy if exists "admins delete game player stats" on public.game_player_stats;
drop policy if exists "users insert own fantasy squad" on public.fantasy_squads;
drop policy if exists "users update own fantasy squad" on public.fantasy_squads;
drop policy if exists "users delete own fantasy squad" on public.fantasy_squads;
drop policy if exists "users insert own fantasy picks" on public.fantasy_picks;
drop policy if exists "users update own fantasy picks" on public.fantasy_picks;
drop policy if exists "users delete own fantasy picks" on public.fantasy_picks;

-- Public reads for authenticated users.
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "players readable" on public.players for select to authenticated using (true);
create policy "games readable" on public.games for select to authenticated using (true);
create policy "lineups readable" on public.game_lineups for select to authenticated using (true);
create policy "events readable" on public.events for select to authenticated using (true);
create policy "game player stats readable" on public.game_player_stats for select to authenticated using (true);
create policy "fantasy squads readable" on public.fantasy_squads for select to authenticated using (true);
create policy "fantasy picks readable" on public.fantasy_picks for select to authenticated using (true);

-- Profile updates are admin-only in v1 to avoid anyone granting themselves admin through direct client calls.
create policy "profiles admin update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Let users rename only their own profile without exposing the is_admin column.
create or replace function public.update_own_username(new_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if length(trim(new_username)) < 2 then
    raise exception 'Name needs at least 2 characters';
  end if;
  update public.profiles set username = trim(new_username) where id = auth.uid();
end;
$$;

revoke all on function public.update_own_username(text) from public;
grant execute on function public.update_own_username(text) to authenticated;

-- Admin-only match data writes.
create policy "admins insert players" on public.players for insert to authenticated with check (public.is_admin());
create policy "admins update players" on public.players for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete players" on public.players for delete to authenticated using (public.is_admin());

create policy "admins insert games" on public.games for insert to authenticated with check (public.is_admin());
create policy "admins update games" on public.games for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete games" on public.games for delete to authenticated using (public.is_admin());

create policy "admins insert lineups" on public.game_lineups for insert to authenticated with check (public.is_admin());
create policy "admins update lineups" on public.game_lineups for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete lineups" on public.game_lineups for delete to authenticated using (public.is_admin());

create policy "admins insert events" on public.events for insert to authenticated with check (public.is_admin());
create policy "admins update events" on public.events for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete events" on public.events for delete to authenticated using (public.is_admin());

create policy "admins insert game player stats" on public.game_player_stats for insert to authenticated with check (public.is_admin());
create policy "admins update game player stats" on public.game_player_stats for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete game player stats" on public.game_player_stats for delete to authenticated using (public.is_admin());

-- Fantasy writes: each account can manage only its own unlocked squad.
create policy "users insert own fantasy squad" on public.fantasy_squads for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.games g where g.id = game_id and g.status in ('upcoming', 'draft'))
);

create policy "users update own fantasy squad" on public.fantasy_squads for update to authenticated
using (
  user_id = auth.uid()
  and exists (select 1 from public.games g where g.id = game_id and g.status in ('upcoming', 'draft'))
)
with check (
  user_id = auth.uid()
  and exists (select 1 from public.games g where g.id = game_id and g.status in ('upcoming', 'draft'))
);

create policy "users delete own fantasy squad" on public.fantasy_squads for delete to authenticated
using (
  user_id = auth.uid()
  and exists (select 1 from public.games g where g.id = game_id and g.status in ('upcoming', 'draft'))
);

create policy "users insert own fantasy picks" on public.fantasy_picks for insert to authenticated
with check (public.squad_is_own_and_unlocked(squad_id));

create policy "users update own fantasy picks" on public.fantasy_picks for update to authenticated
using (public.squad_is_own_and_unlocked(squad_id))
with check (public.squad_is_own_and_unlocked(squad_id));

create policy "users delete own fantasy picks" on public.fantasy_picks for delete to authenticated
using (public.squad_is_own_and_unlocked(squad_id));

-- Helpful indexes
create index if not exists games_date_idx on public.games(game_date desc);
create index if not exists lineups_game_idx on public.game_lineups(game_id);
create index if not exists events_game_idx on public.events(game_id);
create index if not exists game_player_stats_game_idx on public.game_player_stats(game_id);
create index if not exists fantasy_squads_game_idx on public.fantasy_squads(game_id);
create index if not exists fantasy_picks_squad_idx on public.fantasy_picks(squad_id);
