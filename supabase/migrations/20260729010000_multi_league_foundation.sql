-- Multi-league tenancy foundation.
--
-- This migration deliberately migrates the existing application into one
-- "legacy" league before enabling tenant isolation. No current match, fantasy,
-- betting, model, or notification history is discarded.

begin;

create extension if not exists pgcrypto;

create or replace function public.generate_league_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea := extensions.gen_random_bytes(8);
  value text := '';
  index_value integer;
begin
  for index_value in 0..7 loop
    value := value || substr(
      alphabet,
      (get_byte(bytes, index_value) % length(alphabet)) + 1,
      1
    );
  end loop;
  return 'TL-' || substr(value, 1, 4) || '-' || substr(value, 5, 4);
end;
$$;

create or replace function public.slugify_league_name(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(
        regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'),
        '-+',
        '-',
        'g'
      )),
      ''
    ),
    'league'
  );
$$;

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  slug text not null unique check (
    slug = public.slugify_league_name(slug)
    and char_length(slug) between 2 and 72
  ),
  join_code text not null unique check (join_code ~ '^TL-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$'),
  timezone text not null default 'Asia/Beirut' check (char_length(timezone) between 3 and 64),
  fantasy_enabled boolean not null default true,
  betting_enabled boolean not null default true,
  betting_unlock_after_games integer not null default 3 check (betting_unlock_after_games between 0 and 50),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.league_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create table public.league_join_requests (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_via text not null default 'code' check (requested_via = 'code'),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index league_join_requests_one_pending_idx
  on public.league_join_requests(league_id, user_id)
  where status = 'pending';

create table public.league_invite_links (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.app_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('platform_admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index league_memberships_user_status_idx
  on public.league_memberships(user_id, status, league_id);
create index league_memberships_league_status_idx
  on public.league_memberships(league_id, status, role);
create unique index league_memberships_one_active_owner_idx
  on public.league_memberships(league_id)
  where role = 'owner' and status = 'active';
create index league_join_requests_admin_idx
  on public.league_join_requests(league_id, status, created_at);
create index league_invite_links_league_idx
  on public.league_invite_links(league_id, expires_at desc);

-- The fixed UUID makes legacy redirects and production verification stable.
insert into public.leagues(
  id,
  name,
  slug,
  join_code,
  created_by
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Thursday League',
  'thursday-league',
  public.generate_league_code(),
  (
    select profile.id
    from public.profiles profile
    where profile.is_admin
      and coalesce(profile.account_status, 'active') = 'active'
    order by profile.created_at, profile.id
    limit 1
  )
where not exists (
  select 1
  from public.leagues
  where id = '00000000-0000-4000-8000-000000000001'::uuid
);

insert into public.app_roles(user_id, role)
select id, 'platform_admin'
from public.profiles
where is_admin
  and coalesce(account_status, 'active') <> 'deleted'
on conflict do nothing;

insert into public.league_memberships(league_id, user_id, role, status)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  profile.id,
  case
    when profile.id = (
      select league.created_by
      from public.leagues league
      where league.id = '00000000-0000-4000-8000-000000000001'::uuid
    ) then 'owner'
    when profile.is_admin then 'admin'
    else 'member'
  end,
  'active'
from public.profiles profile
where coalesce(profile.account_status, 'active') <> 'deleted'
on conflict (league_id, user_id) do nothing;

alter table public.profiles
  add column if not exists last_active_league_id uuid references public.leagues(id) on delete set null;

update public.profiles
set last_active_league_id = '00000000-0000-4000-8000-000000000001'::uuid
where last_active_league_id is null
  and exists (
    select 1
    from public.league_memberships membership
    where membership.user_id = profiles.id
      and membership.league_id = '00000000-0000-4000-8000-000000000001'::uuid
      and membership.status = 'active'
  );

create or replace function public.is_platform_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_user_id is not null
    and exists (
      select 1
      from public.app_roles app_role
      join public.profiles profile on profile.id = app_role.user_id
      where app_role.user_id = target_user_id
        and app_role.role = 'platform_admin'
        and coalesce(profile.account_status, 'active') = 'active'
    );
$$;

create or replace function public.is_league_member(
  target_league_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_league_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.league_memberships membership
      join public.leagues league on league.id = membership.league_id
      join public.profiles profile on profile.id = membership.user_id
      where membership.league_id = target_league_id
        and membership.user_id = target_user_id
        and membership.status = 'active'
        and league.status = 'active'
        and coalesce(profile.account_status, 'active') = 'active'
    );
$$;

create or replace function public.is_league_admin(
  target_league_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_league_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.league_memberships membership
      join public.leagues league on league.id = membership.league_id
      join public.profiles profile on profile.id = membership.user_id
      where membership.league_id = target_league_id
        and membership.user_id = target_user_id
        and membership.role in ('owner', 'admin')
        and membership.status = 'active'
        and league.status = 'active'
        and coalesce(profile.account_status, 'active') = 'active'
    );
$$;

create or replace function public.is_league_owner(
  target_league_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_league_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.league_memberships membership
      join public.leagues league on league.id = membership.league_id
      join public.profiles profile on profile.id = membership.user_id
      where membership.league_id = target_league_id
        and membership.user_id = target_user_id
        and membership.role = 'owner'
        and membership.status = 'active'
        and league.status = 'active'
        and coalesce(profile.account_status, 'active') = 'active'
    );
$$;

-- Compatibility for controlled functions written before multi-league. Their
-- row mutations are additionally guarded by tenant-aware triggers below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin(auth.uid())
    or exists (
      select 1
      from public.league_memberships membership
      where membership.user_id = auth.uid()
        and membership.role in ('owner', 'admin')
        and membership.status = 'active'
    );
$$;

create or replace function public.current_league_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select profile.last_active_league_id
      from public.profiles profile
      where profile.id = auth.uid()
        and public.is_league_member(profile.last_active_league_id, auth.uid())
    ),
    (
      select membership.league_id
      from public.league_memberships membership
      where membership.user_id = auth.uid()
        and membership.status = 'active'
      order by membership.joined_at, membership.league_id
      limit 1
    )
  );
$$;

-- Add the tenant key to every league-owned record before tightening policies.
alter table public.players add column if not exists league_id uuid;
alter table public.seasons add column if not exists league_id uuid;
alter table public.league_settings add column if not exists league_id uuid;
alter table public.games add column if not exists league_id uuid;
alter table public.game_lineups add column if not exists league_id uuid;
alter table public.events add column if not exists league_id uuid;
alter table public.game_player_stats add column if not exists league_id uuid;
alter table public.admin_audit_log add column if not exists league_id uuid;
alter table public.fantasy_squads add column if not exists league_id uuid;
alter table public.fantasy_picks add column if not exists league_id uuid;
alter table public.notification_preferences add column if not exists league_id uuid;
alter table public.notification_dispatches add column if not exists league_id uuid;
alter table public.notification_deliveries add column if not exists league_id uuid;
alter table public.betting_settings add column if not exists league_id uuid;
alter table public.odds_generation_runs add column if not exists league_id uuid;
alter table public.betting_markets add column if not exists league_id uuid;
alter table public.betting_outcomes add column if not exists league_id uuid;
alter table public.betting_wallets add column if not exists league_id uuid;
alter table public.bet_slips add column if not exists league_id uuid;
alter table public.bet_legs add column if not exists league_id uuid;
alter table public.game_result_versions add column if not exists league_id uuid;
alter table public.bet_settlement_runs add column if not exists league_id uuid;
alter table public.coin_ledger add column if not exists league_id uuid;

update public.players set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.seasons set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.league_settings set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
-- Finalized games reject direct updates. This transaction-scoped flag is the
-- same controlled escape hatch used by the finalize/reopen RPCs and permits
-- only this database-owner backfill session to attach the legacy tenant.
select set_config('app.allow_final_transition', 'true', true);
update public.games set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
select set_config('app.allow_final_transition', 'false', true);
update public.game_lineups set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.events set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.game_player_stats set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.admin_audit_log set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.fantasy_squads set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.fantasy_picks set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.notification_preferences set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.notification_dispatches set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.notification_deliveries set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.betting_settings set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.odds_generation_runs set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.betting_markets set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.betting_outcomes set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.betting_wallets set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.bet_slips set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.bet_legs set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.game_result_versions set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.bet_settlement_runs set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;
update public.coin_ledger set league_id = '00000000-0000-4000-8000-000000000001' where league_id is null;

alter table public.players alter column league_id set not null;
alter table public.seasons alter column league_id set not null;
alter table public.league_settings alter column league_id set not null;
alter table public.games alter column league_id set not null;
alter table public.game_lineups alter column league_id set not null;
alter table public.events alter column league_id set not null;
alter table public.game_player_stats alter column league_id set not null;
alter table public.admin_audit_log alter column league_id set not null;
alter table public.fantasy_squads alter column league_id set not null;
alter table public.fantasy_picks alter column league_id set not null;
alter table public.notification_preferences alter column league_id set not null;
alter table public.notification_dispatches alter column league_id set not null;
alter table public.notification_deliveries alter column league_id set not null;
alter table public.betting_settings alter column league_id set not null;
alter table public.odds_generation_runs alter column league_id set not null;
alter table public.betting_markets alter column league_id set not null;
alter table public.betting_outcomes alter column league_id set not null;
alter table public.betting_wallets alter column league_id set not null;
alter table public.bet_slips alter column league_id set not null;
alter table public.bet_legs alter column league_id set not null;
alter table public.game_result_versions alter column league_id set not null;
alter table public.bet_settlement_runs alter column league_id set not null;
alter table public.coin_ledger alter column league_id set not null;

-- Controlled legacy RPCs often omit league_id in their INSERT lists. Resolve
-- that omission from the caller's active membership while all write guards
-- still verify the resulting tenant. The fixed fallback is only used by a
-- direct database-owner session (migrations, seeds, and local SQL tests).
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'players',
    'seasons',
    'league_settings',
    'games',
    'game_lineups',
    'events',
    'game_player_stats',
    'admin_audit_log',
    'fantasy_squads',
    'fantasy_picks',
    'notification_preferences',
    'notification_dispatches',
    'notification_deliveries',
    'betting_settings',
    'odds_generation_runs',
    'betting_markets',
    'betting_outcomes',
    'betting_wallets',
    'bet_slips',
    'bet_legs',
    'game_result_versions',
    'bet_settlement_runs',
    'coin_ledger'
  ]
  loop
    execute format(
      'alter table public.%I alter column league_id set default coalesce(public.current_league_id(), %L::uuid)',
      target_table,
      '00000000-0000-4000-8000-000000000001'
    );
  end loop;
end;
$$;

-- Singleton settings become one row per league while retaining their numeric id
-- for compatibility with older generated types.
alter table public.league_settings drop constraint if exists league_settings_id_check;
create sequence if not exists public.league_settings_id_seq as smallint;
select setval(
  'public.league_settings_id_seq',
  greatest(coalesce((select max(id) from public.league_settings), 1), 1)
);
alter table public.league_settings
  alter column id set default nextval('public.league_settings_id_seq');
alter sequence public.league_settings_id_seq owned by public.league_settings.id;

alter table public.betting_settings drop constraint if exists betting_settings_id_check;
create sequence if not exists public.betting_settings_id_seq as smallint;
select setval(
  'public.betting_settings_id_seq',
  greatest(coalesce((select max(id) from public.betting_settings), 1), 1)
);
alter table public.betting_settings
  alter column id set default nextval('public.betting_settings_id_seq');
alter sequence public.betting_settings_id_seq owned by public.betting_settings.id;

alter table public.players drop constraint if exists players_name_key;
drop index if exists public.players_name_key;
create unique index players_league_name_key
  on public.players(league_id, lower(trim(name)));

alter table public.seasons drop constraint if exists seasons_name_key;
alter table public.seasons drop constraint if exists seasons_format_start_date_end_date_key;
create unique index seasons_league_name_key
  on public.seasons(league_id, lower(trim(name)));
alter table public.seasons
  add constraint seasons_league_dates_key unique (league_id, format, start_date, end_date);

alter table public.notification_preferences
  drop constraint if exists notification_preferences_pkey;
alter table public.notification_preferences
  add constraint notification_preferences_pkey primary key (league_id, user_id);

alter table public.notification_dispatches
  drop constraint if exists notification_dispatches_dedupe_key_key;
alter table public.notification_dispatches
  add constraint notification_dispatches_league_dedupe_key unique (league_id, dedupe_key);

alter table public.betting_wallets
  drop constraint if exists betting_wallets_user_id_season_id_key;
alter table public.betting_wallets
  add constraint betting_wallets_league_user_season_key unique (league_id, user_id, season_id);

alter table public.league_settings
  add constraint league_settings_league_key unique (league_id);
alter table public.betting_settings
  add constraint betting_settings_league_key unique (league_id);

-- Every referenced tenant entity exposes a composite key so child records must
-- belong to the same league as their parent.
alter table public.players add constraint players_league_id_id_key unique (league_id, id);
alter table public.seasons add constraint seasons_league_id_id_key unique (league_id, id);
alter table public.games add constraint games_league_id_id_key unique (league_id, id);
alter table public.game_lineups add constraint game_lineups_league_id_id_key unique (league_id, id);
alter table public.fantasy_squads add constraint fantasy_squads_league_id_id_key unique (league_id, id);
alter table public.odds_generation_runs add constraint odds_generation_runs_league_id_id_key unique (league_id, id);
alter table public.betting_markets add constraint betting_markets_league_id_id_key unique (league_id, id);
alter table public.betting_outcomes add constraint betting_outcomes_league_id_id_key unique (league_id, id);
alter table public.betting_wallets add constraint betting_wallets_league_id_id_key unique (league_id, id);
alter table public.bet_slips add constraint bet_slips_league_id_id_key unique (league_id, id);
alter table public.game_result_versions add constraint game_result_versions_league_id_id_key unique (league_id, id);
alter table public.notification_dispatches add constraint notification_dispatches_league_id_id_key unique (league_id, id);

-- Direct league ownership.
alter table public.players add constraint players_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.seasons add constraint seasons_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.league_settings add constraint league_settings_league_id_fkey foreign key (league_id) references public.leagues(id) on delete cascade;
alter table public.games add constraint games_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.game_lineups add constraint game_lineups_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.events add constraint events_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.game_player_stats add constraint game_player_stats_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.admin_audit_log add constraint admin_audit_log_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.fantasy_squads add constraint fantasy_squads_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.fantasy_picks add constraint fantasy_picks_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.notification_preferences add constraint notification_preferences_league_id_fkey foreign key (league_id) references public.leagues(id) on delete cascade;
alter table public.notification_dispatches add constraint notification_dispatches_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.notification_deliveries add constraint notification_deliveries_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.betting_settings add constraint betting_settings_league_id_fkey foreign key (league_id) references public.leagues(id) on delete cascade;
alter table public.odds_generation_runs add constraint odds_generation_runs_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.betting_markets add constraint betting_markets_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.betting_outcomes add constraint betting_outcomes_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.betting_wallets add constraint betting_wallets_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.bet_slips add constraint bet_slips_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.bet_legs add constraint bet_legs_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.game_result_versions add constraint game_result_versions_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.bet_settlement_runs add constraint bet_settlement_runs_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;
alter table public.coin_ledger add constraint coin_ledger_league_id_fkey foreign key (league_id) references public.leagues(id) on delete restrict;

-- Cross-tenant reference protection.
alter table public.games add constraint games_league_season_fkey
  foreign key (league_id, season_id) references public.seasons(league_id, id) on delete restrict;
alter table public.games add constraint games_league_potm_fkey
  foreign key (league_id, potm_player_id) references public.players(league_id, id) on delete restrict;
alter table public.league_settings add constraint league_settings_league_current_season_fkey
  foreign key (league_id, current_season_id) references public.seasons(league_id, id) on delete restrict;
alter table public.game_lineups add constraint game_lineups_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete cascade;
alter table public.game_lineups add constraint game_lineups_league_player_fkey
  foreign key (league_id, player_id) references public.players(league_id, id) on delete restrict;
alter table public.events add constraint events_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete cascade;
alter table public.events add constraint events_league_player_fkey
  foreign key (league_id, player_id) references public.players(league_id, id) on delete restrict;
alter table public.events add constraint events_league_assist_player_fkey
  foreign key (league_id, assist_player_id) references public.players(league_id, id) on delete restrict;
alter table public.game_player_stats add constraint game_player_stats_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete cascade;
alter table public.game_player_stats add constraint game_player_stats_league_player_fkey
  foreign key (league_id, player_id) references public.players(league_id, id) on delete restrict;
alter table public.admin_audit_log add constraint admin_audit_log_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete restrict;
alter table public.fantasy_squads add constraint fantasy_squads_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete cascade;
alter table public.fantasy_picks add constraint fantasy_picks_league_squad_fkey
  foreign key (league_id, squad_id) references public.fantasy_squads(league_id, id) on delete cascade;
alter table public.fantasy_picks add constraint fantasy_picks_league_player_fkey
  foreign key (league_id, player_id) references public.players(league_id, id) on delete restrict;
alter table public.notification_dispatches add constraint notification_dispatches_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete restrict;
alter table public.notification_deliveries add constraint notification_deliveries_league_dispatch_fkey
  foreign key (league_id, dispatch_id) references public.notification_dispatches(league_id, id) on delete cascade;
alter table public.odds_generation_runs add constraint odds_generation_runs_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete cascade;
alter table public.betting_markets add constraint betting_markets_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete cascade;
alter table public.betting_markets add constraint betting_markets_league_generation_fkey
  foreign key (league_id, generation_run_id) references public.odds_generation_runs(league_id, id) on delete cascade;
alter table public.betting_markets add constraint betting_markets_league_player_fkey
  foreign key (league_id, subject_player_id) references public.players(league_id, id) on delete restrict;
alter table public.betting_outcomes add constraint betting_outcomes_league_market_fkey
  foreign key (league_id, market_id) references public.betting_markets(league_id, id) on delete cascade;
alter table public.betting_wallets add constraint betting_wallets_league_season_fkey
  foreign key (league_id, season_id) references public.seasons(league_id, id) on delete restrict;
alter table public.bet_slips add constraint bet_slips_league_wallet_fkey
  foreign key (league_id, wallet_id) references public.betting_wallets(league_id, id) on delete restrict;
alter table public.bet_slips add constraint bet_slips_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete restrict;
alter table public.bet_slips add constraint bet_slips_league_season_fkey
  foreign key (league_id, season_id) references public.seasons(league_id, id) on delete restrict;
alter table public.bet_slips add constraint bet_slips_league_result_version_fkey
  foreign key (league_id, result_version_id) references public.game_result_versions(league_id, id) on delete restrict;
alter table public.bet_legs add constraint bet_legs_league_slip_fkey
  foreign key (league_id, slip_id) references public.bet_slips(league_id, id) on delete restrict;
alter table public.bet_legs add constraint bet_legs_league_market_fkey
  foreign key (league_id, market_id) references public.betting_markets(league_id, id) on delete restrict;
alter table public.bet_legs add constraint bet_legs_league_outcome_fkey
  foreign key (league_id, outcome_id) references public.betting_outcomes(league_id, id) on delete restrict;
alter table public.game_result_versions add constraint game_result_versions_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete restrict;
alter table public.bet_settlement_runs add constraint bet_settlement_runs_league_game_fkey
  foreign key (league_id, game_id) references public.games(league_id, id) on delete restrict;
alter table public.bet_settlement_runs add constraint bet_settlement_runs_league_result_fkey
  foreign key (league_id, result_version_id) references public.game_result_versions(league_id, id) on delete restrict;
alter table public.coin_ledger add constraint coin_ledger_league_wallet_fkey
  foreign key (league_id, wallet_id) references public.betting_wallets(league_id, id) on delete restrict;
alter table public.coin_ledger add constraint coin_ledger_league_slip_fkey
  foreign key (league_id, slip_id) references public.bet_slips(league_id, id) on delete restrict;

-- The old single-column events assist FK used ON DELETE SET NULL. Players are
-- archived rather than deleted, so retaining it would conflict with the
-- composite tenant FK on deletion.
alter table public.events drop constraint if exists events_assist_player_id_fkey;

create index players_league_active_idx on public.players(league_id, active, archived_at);
create index seasons_league_dates_idx on public.seasons(league_id, start_date desc);
create index games_league_date_idx on public.games(league_id, game_date desc);
create index game_lineups_league_game_idx on public.game_lineups(league_id, game_id);
create index events_league_game_idx on public.events(league_id, game_id, created_at);
create index game_player_stats_league_game_idx on public.game_player_stats(league_id, game_id);
create index fantasy_squads_league_game_idx on public.fantasy_squads(league_id, game_id);
create index fantasy_squads_league_user_idx on public.fantasy_squads(league_id, user_id);
create index betting_markets_league_game_idx on public.betting_markets(league_id, game_id, status);
create index betting_wallets_league_user_idx on public.betting_wallets(league_id, user_id, season_id);
create index bet_slips_league_user_idx on public.bet_slips(league_id, user_id, placed_at desc);
create index notification_dispatches_league_idx on public.notification_dispatches(league_id, created_at desc);

-- Infer the tenant from the parent record for controlled functions created
-- before this migration. A supplied conflicting tenant is rejected.
create or replace function public.fill_child_league_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inferred_league_id uuid;
begin
  case tg_table_name
    when 'game_lineups' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'events' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'game_player_stats' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'fantasy_squads' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'fantasy_picks' then
      select league_id into inferred_league_id from public.fantasy_squads where id = new.squad_id;
    when 'odds_generation_runs' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'betting_markets' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'betting_outcomes' then
      select league_id into inferred_league_id from public.betting_markets where id = new.market_id;
    when 'betting_wallets' then
      select league_id into inferred_league_id from public.seasons where id = new.season_id;
    when 'bet_slips' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'bet_legs' then
      select league_id into inferred_league_id from public.bet_slips where id = new.slip_id;
    when 'game_result_versions' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'bet_settlement_runs' then
      select league_id into inferred_league_id from public.games where id = new.game_id;
    when 'coin_ledger' then
      select league_id into inferred_league_id from public.betting_wallets where id = new.wallet_id;
    when 'notification_deliveries' then
      select league_id into inferred_league_id from public.notification_dispatches where id = new.dispatch_id;
    else
      raise exception 'Unsupported tenant inference table: %', tg_table_name;
  end case;

  if inferred_league_id is null then
    raise exception 'The parent record does not exist';
  end if;
  if new.league_id is not null and new.league_id <> inferred_league_id then
    raise exception 'Cross-league records are not allowed';
  end if;
  new.league_id := inferred_league_id;
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'game_lineups',
    'events',
    'game_player_stats',
    'fantasy_squads',
    'fantasy_picks',
    'odds_generation_runs',
    'betting_markets',
    'betting_outcomes',
    'betting_wallets',
    'bet_slips',
    'bet_legs',
    'game_result_versions',
    'bet_settlement_runs',
    'coin_ledger',
    'notification_deliveries'
  ]
  loop
    execute format('drop trigger if exists fill_child_league_id on public.%I', target_table);
    execute format(
      'create trigger fill_child_league_id before insert or update on public.%I for each row execute function public.fill_child_league_id()',
      target_table
    );
  end loop;
end;
$$;

-- A second line of defense for security-definer functions: even an admin of
-- another league cannot mutate a row in this league.
create or replace function public.guard_league_admin_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_league_id uuid := case when tg_op = 'DELETE' then old.league_id else new.league_id end;
begin
  if auth.role() = 'service_role'
     or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'))
     or public.is_platform_admin(auth.uid())
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not public.is_league_admin(target_league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'players',
    'seasons',
    'league_settings',
    'games',
    'game_lineups',
    'events',
    'game_player_stats',
    'admin_audit_log',
    'betting_settings',
    'odds_generation_runs',
    'betting_markets',
    'betting_outcomes',
    'game_result_versions',
    'bet_settlement_runs'
  ]
  loop
    execute format('drop trigger if exists guard_league_admin_write on public.%I', target_table);
    execute format(
      'create trigger guard_league_admin_write before insert or update or delete on public.%I for each row execute function public.guard_league_admin_write()',
      target_table
    );
  end loop;
end;
$$;

-- Generic player/game/event/stat audits must inherit tenancy from the row
-- being changed. Using current_league_id() here creates a race immediately
-- after switching leagues or promoting a member in a second league.
create or replace function public.capture_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  current_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  relevant_row jsonb := coalesce(current_row, previous_row);
  target_game_id uuid;
  target_league_id uuid := nullif(relevant_row ->> 'league_id', '')::uuid;
begin
  if not public.is_admin()
     or coalesce(current_setting('app.suppress_generic_audit', true), 'false') = 'true'
  then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'games' and tg_op <> 'DELETE' then
    target_game_id := nullif(relevant_row ->> 'id', '')::uuid;
  elsif tg_table_name in ('events', 'game_player_stats') then
    target_game_id := nullif(relevant_row ->> 'game_id', '')::uuid;
  end if;

  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    game_id,
    action,
    before_data,
    after_data
  )
  values (
    target_league_id,
    auth.uid(),
    target_game_id,
    tg_table_name || '_' || lower(tg_op),
    previous_row,
    current_row
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_member_owned_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  row_value record := case when tg_op = 'DELETE' then old else new end;
  target_league_id uuid := row_value.league_id;
  owner_id uuid;
begin
  if auth.role() = 'service_role'
     or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'))
     or public.is_platform_admin(auth.uid())
     or public.is_league_admin(target_league_id, auth.uid())
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not public.is_league_member(target_league_id, auth.uid()) then
    raise exception 'Active league membership required';
  end if;

  case tg_table_name
    when 'fantasy_squads' then owner_id := row_value.user_id;
    when 'fantasy_picks' then
      select user_id into owner_id from public.fantasy_squads where id = row_value.squad_id;
    when 'betting_wallets' then owner_id := row_value.user_id;
    when 'bet_slips' then owner_id := row_value.user_id;
    when 'bet_legs' then
      select user_id into owner_id from public.bet_slips where id = row_value.slip_id;
    when 'coin_ledger' then
      select user_id into owner_id from public.betting_wallets where id = row_value.wallet_id;
    when 'notification_preferences' then owner_id := row_value.user_id;
    else raise exception 'Unsupported member-owned table: %', tg_table_name;
  end case;

  if owner_id is distinct from auth.uid() then
    raise exception 'You can only change your own league records';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'fantasy_squads',
    'fantasy_picks',
    'betting_wallets',
    'bet_slips',
    'bet_legs',
    'coin_ledger',
    'notification_preferences'
  ]
  loop
    execute format('drop trigger if exists guard_member_owned_write on public.%I', target_table);
    execute format(
      'create trigger guard_member_owned_write before insert or update or delete on public.%I for each row execute function public.guard_member_owned_write()',
      target_table
    );
  end loop;
end;
$$;

create or replace function public.guard_platform_notification_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role'
     and not (auth.uid() is null and session_user in ('postgres', 'supabase_admin'))
     and not public.is_platform_admin(auth.uid())
  then
    raise exception 'Platform notification access required';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists guard_platform_notification_write on public.notification_dispatches;
create trigger guard_platform_notification_write
before insert or update or delete on public.notification_dispatches
for each row execute function public.guard_platform_notification_write();

drop trigger if exists guard_platform_notification_delivery_write on public.notification_deliveries;
create trigger guard_platform_notification_delivery_write
before insert or update or delete on public.notification_deliveries
for each row execute function public.guard_platform_notification_write();

create or replace function public.guard_last_league_admin_account_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.account_status, 'active') = 'active'
     and coalesce(new.account_status, 'active') <> 'active'
     and exists (
       select 1
       from public.league_memberships membership
       where membership.user_id = old.id
         and membership.role = 'owner'
         and membership.status = 'active'
         and not exists (
           select 1
           from public.league_memberships replacement
           join public.profiles replacement_profile on replacement_profile.id = replacement.user_id
           where replacement.league_id = membership.league_id
             and replacement.user_id <> old.id
             and replacement.role = 'owner'
             and replacement.status = 'active'
             and coalesce(replacement_profile.account_status, 'active') = 'active'
         )
     )
  then
    raise exception 'Transfer league ownership before deactivating or deleting this account';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_last_league_admin_account_change on public.profiles;
create trigger guard_last_league_admin_account_change
before update of account_status on public.profiles
for each row execute function public.guard_last_league_admin_account_change();

-- Season assignment now respects the game league and its timezone.
create or replace function public.assign_game_season()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_mode text;
  target_timezone text;
  local_game_date date;
  game_year integer;
begin
  if new.league_id is null then
    new.league_id := public.current_league_id();
  end if;
  select settings.season_mode, league.timezone
  into selected_mode, target_timezone
  from public.league_settings settings
  join public.leagues league on league.id = settings.league_id
  where settings.league_id = new.league_id;

  target_timezone := coalesce(target_timezone, 'Asia/Beirut');
  local_game_date := (new.game_date at time zone target_timezone)::date;
  game_year := extract(year from local_game_date)::integer;

  if coalesce(selected_mode, 'yearly') = 'yearly' then
    insert into public.seasons(league_id, name, format, start_date, end_date)
    values (
      new.league_id,
      game_year::text,
      'yearly',
      make_date(game_year, 1, 1),
      make_date(game_year, 12, 31)
    )
    on conflict (league_id, format, start_date, end_date) do nothing;

    select season.id into new.season_id
    from public.seasons season
    where season.league_id = new.league_id
      and season.format = 'yearly'
      and local_game_date between season.start_date and season.end_date
    limit 1;
  else
    select season.id into new.season_id
    from public.seasons season
    where season.league_id = new.league_id
      and season.format = 'custom'
      and local_game_date between season.start_date and season.end_date
    order by season.start_date desc
    limit 1;
  end if;
  return new;
end;
$$;

-- Create preferences and wallets when membership is activated.
create or replace function public.provision_league_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.notification_preferences(league_id, user_id)
    values (new.league_id, new.user_id)
    on conflict (league_id, user_id) do nothing;

    insert into public.betting_wallets(league_id, user_id, season_id, balance_units)
    select
      new.league_id,
      new.user_id,
      season.id,
      settings.starting_balance_units
    from public.seasons season
    join public.betting_settings settings on settings.league_id = season.league_id
    where season.league_id = new.league_id
    on conflict (league_id, user_id, season_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists provision_league_membership on public.league_memberships;
create trigger provision_league_membership
after insert or update of status on public.league_memberships
for each row execute function public.provision_league_membership();

-- Existing profile creation is no longer enough to create preferences because a
-- new account may have zero leagues.
create or replace function public.create_default_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_preferences(league_id, user_id)
  select membership.league_id, new.id
  from public.league_memberships membership
  where membership.user_id = new.id
    and membership.status = 'active'
  on conflict (league_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.initialize_betting_wallet(
  target_user_id uuid,
  target_season_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_league_id uuid;
  starting_balance bigint;
  wallet_id uuid;
begin
  select season.league_id into target_league_id
  from public.seasons season
  where season.id = target_season_id;
  if target_league_id is null then raise exception 'Season not found'; end if;
  if target_user_id <> auth.uid()
     and auth.role() <> 'service_role'
     and not public.is_league_admin(target_league_id, auth.uid())
  then
    raise exception 'Wallet access denied';
  end if;
  if not public.is_league_member(target_league_id, target_user_id) then
    raise exception 'Active league membership required';
  end if;

  select settings.starting_balance_units into starting_balance
  from public.betting_settings settings
  where settings.league_id = target_league_id;
  if starting_balance is null then raise exception 'Betting settings are missing'; end if;

  insert into public.betting_wallets(league_id, user_id, season_id, balance_units)
  values (target_league_id, target_user_id, target_season_id, starting_balance)
  on conflict (league_id, user_id, season_id) do nothing;

  select id into wallet_id
  from public.betting_wallets
  where league_id = target_league_id
    and user_id = target_user_id
    and season_id = target_season_id;
  return wallet_id;
end;
$$;

create or replace function public.ensure_betting_wallet(target_season_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return public.initialize_betting_wallet(auth.uid(), target_season_id);
end;
$$;

create or replace function public.initialize_wallets_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Membership activation performs tenant-aware wallet provisioning.
  return new;
end;
$$;

create or replace function public.initialize_wallets_for_season()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.betting_wallets(league_id, user_id, season_id, balance_units)
  select
    new.league_id,
    membership.user_id,
    new.id,
    settings.starting_balance_units
  from public.league_memberships membership
  join public.betting_settings settings on settings.league_id = membership.league_id
  where membership.league_id = new.league_id
    and membership.status = 'active'
  on conflict (league_id, user_id, season_id) do nothing;
  return new;
end;
$$;

-- Populate the now-tenant-aware preferences and wallet rows for legacy users.
insert into public.notification_preferences(league_id, user_id)
select membership.league_id, membership.user_id
from public.league_memberships membership
where membership.status = 'active'
on conflict (league_id, user_id) do nothing;

insert into public.betting_wallets(league_id, user_id, season_id, balance_units)
select
  membership.league_id,
  membership.user_id,
  season.id,
  settings.starting_balance_units
from public.league_memberships membership
join public.seasons season on season.league_id = membership.league_id
join public.betting_settings settings on settings.league_id = membership.league_id
where membership.status = 'active'
on conflict (league_id, user_id, season_id) do nothing;

-- Helper used by the UI to explain the automatic betting cold start.
create or replace function public.league_betting_availability(target_league_id uuid)
returns table (
  enabled boolean,
  unlocked boolean,
  completed_games integer,
  required_games integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    league.betting_enabled,
    league.betting_enabled
      and count(game.id)::integer >= league.betting_unlock_after_games,
    count(game.id)::integer,
    league.betting_unlock_after_games
  from public.leagues league
  left join public.games game
    on game.league_id = league.id
   and game.status = 'final'
  where league.id = target_league_id
    and public.is_league_member(league.id, auth.uid())
  group by league.id;
$$;

-- Keep update timestamps consistent.
drop trigger if exists leagues_touch_updated_at on public.leagues;
create trigger leagues_touch_updated_at
before update on public.leagues
for each row execute function public.touch_updated_at();

drop trigger if exists league_memberships_touch_updated_at on public.league_memberships;
create trigger league_memberships_touch_updated_at
before update on public.league_memberships
for each row execute function public.touch_updated_at();

drop trigger if exists league_join_requests_touch_updated_at on public.league_join_requests;
create trigger league_join_requests_touch_updated_at
before update on public.league_join_requests
for each row execute function public.touch_updated_at();

commit;
