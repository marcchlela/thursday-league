-- Tenant RLS, league lifecycle, invitation, and membership operations.

begin;

-- Remove every pre-tenancy policy from league-owned tables. Recreating the
-- complete policy set here makes it auditable and prevents a forgotten
-- `using (true)` policy from defeating tenant isolation.
do $$
declare
  policy_row record;
  target_tables constant text[] := array[
    'profiles',
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
    'coin_ledger',
    'leagues',
    'league_memberships',
    'league_join_requests',
    'league_invite_links',
    'app_roles'
  ];
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(target_tables)
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$$;

alter table public.leagues enable row level security;
alter table public.league_memberships enable row level security;
alter table public.league_join_requests enable row level security;
alter table public.league_invite_links enable row level security;
alter table public.app_roles enable row level security;

create policy "profiles self or platform support readable"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_platform_admin(auth.uid())
);

create policy "active memberships read their leagues"
on public.leagues
for select
to authenticated
using (
  public.is_league_member(id, auth.uid())
  or public.is_platform_admin(auth.uid())
);

create policy "members read league directory"
on public.league_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    status = 'active'
    and public.is_league_member(league_id, auth.uid())
  )
);

create policy "users and admins read join requests"
on public.league_join_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_league_admin(league_id, auth.uid())
);

create policy "users read own platform role"
on public.app_roles
for select
to authenticated
using (user_id = auth.uid());

-- League pages need usernames and avatars for standings, but must not receive
-- private account fields such as account status timestamps, the last active
-- league, or platform role compatibility flags.
create or replace function public.get_league_member_directory(target_league_id uuid)
returns table (
  id uuid,
  username text,
  avatar_path text
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_member(target_league_id, auth.uid()) then
    raise exception 'Active league membership required';
  end if;
  return query
  select
    profile.id,
    profile.username,
    profile.avatar_path
  from public.profiles profile
  where (
      exists (
        select 1
        from public.league_memberships membership
        where membership.league_id = target_league_id
          and membership.user_id = profile.id
          and membership.status = 'active'
      )
      or (
        public.is_league_admin(target_league_id, auth.uid())
        and coalesce(profile.account_status, 'active') = 'active'
        and exists (
          select 1
          from public.league_join_requests request
          where request.league_id = target_league_id
            and request.user_id = profile.id
            and request.status = 'pending'
        )
      )
    )
  order by lower(profile.username);
end;
$$;

create policy "members read players"
on public.players
for select
to authenticated
using (public.is_league_member(league_id, auth.uid()));

create policy "league admins insert players"
on public.players
for insert
to authenticated
with check (public.is_league_admin(league_id, auth.uid()));

create policy "members read seasons"
on public.seasons
for select
to authenticated
using (public.is_league_member(league_id, auth.uid()));

create policy "members read league settings"
on public.league_settings
for select
to authenticated
using (public.is_league_member(league_id, auth.uid()));

create policy "members read games"
on public.games
for select
to authenticated
using (public.is_league_member(league_id, auth.uid()));

create policy "league admins insert games"
on public.games
for insert
to authenticated
with check (public.is_league_admin(league_id, auth.uid()));

create policy "league admins update games"
on public.games
for update
to authenticated
using (public.is_league_admin(league_id, auth.uid()))
with check (public.is_league_admin(league_id, auth.uid()));

create policy "league admins delete games"
on public.games
for delete
to authenticated
using (public.is_league_admin(league_id, auth.uid()));

create policy "members read lineups"
on public.game_lineups
for select
to authenticated
using (public.is_league_member(league_id, auth.uid()));

create policy "members read events"
on public.events
for select
to authenticated
using (public.is_league_member(league_id, auth.uid()));

create policy "members read player stats"
on public.game_player_stats
for select
to authenticated
using (public.is_league_member(league_id, auth.uid()));

create policy "league admins read audit history"
on public.admin_audit_log
for select
to authenticated
using (public.is_league_admin(league_id, auth.uid()));

-- Fantasy selections stay private before kickoff. Admins receive a separate
-- readiness summary and are intentionally not allowed to inspect selections.
create policy "fantasy squads tenant privacy"
on public.fantasy_squads
for select
to authenticated
using (
  public.is_league_member(league_id, auth.uid())
  and (
    user_id = auth.uid()
    or exists (
      select 1
      from public.games game
      where game.id = fantasy_squads.game_id
        and game.league_id = fantasy_squads.league_id
        and (
          game.status in ('live', 'final')
          or now() >= game.game_date
        )
    )
  )
);

create policy "fantasy picks tenant privacy"
on public.fantasy_picks
for select
to authenticated
using (
  public.is_league_member(league_id, auth.uid())
  and exists (
    select 1
    from public.fantasy_squads squad
    join public.games game
      on game.id = squad.game_id
     and game.league_id = squad.league_id
    where squad.id = fantasy_picks.squad_id
      and squad.league_id = fantasy_picks.league_id
      and (
        squad.user_id = auth.uid()
        or game.status in ('live', 'final')
        or now() >= game.game_date
      )
  )
);

create policy "users read own league notification preferences"
on public.notification_preferences
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_league_member(league_id, auth.uid())
);

create policy "users insert own league notification preferences"
on public.notification_preferences
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_league_member(league_id, auth.uid())
);

create policy "users update own league notification preferences"
on public.notification_preferences
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_league_member(league_id, auth.uid())
)
with check (
  user_id = auth.uid()
  and public.is_league_member(league_id, auth.uid())
);

create policy "platform reads notification dispatches"
on public.notification_dispatches
for select
to authenticated
using (public.is_platform_admin(auth.uid()));

create policy "users read own notification deliveries"
on public.notification_deliveries
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_admin(auth.uid())
);

create policy "platform reads model generations"
on public.odds_generation_runs
for select
to authenticated
using (public.is_platform_admin(auth.uid()));

create or replace function public.get_league_betting_public_settings(target_league_id uuid)
returns table (
  id smallint,
  league_id uuid,
  starting_balance_units bigint,
  lock_minutes integer,
  builder_margin numeric,
  max_builder_selections integer,
  max_total_odds numeric,
  max_potential_payout_units bigint,
  max_bets_per_minute integer,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_member(target_league_id, auth.uid()) then
    raise exception 'Active league membership required';
  end if;
  return query
  select
    settings.id,
    settings.league_id,
    settings.starting_balance_units,
    settings.lock_minutes,
    settings.builder_margin,
    settings.max_builder_selections,
    settings.max_total_odds,
    settings.max_potential_payout_units,
    settings.max_bets_per_minute,
    settings.updated_at
  from public.betting_settings settings
  where settings.league_id = target_league_id;
end;
$$;

create policy "members read published markets"
on public.betting_markets
for select
to authenticated
using (
  public.is_league_member(league_id, auth.uid())
  and (
    status <> 'draft'
    or public.is_platform_admin(auth.uid())
  )
);

create policy "members read published outcomes"
on public.betting_outcomes
for select
to authenticated
using (
  public.is_league_member(league_id, auth.uid())
  and exists (
    select 1
    from public.betting_markets market
    where market.id = betting_outcomes.market_id
      and market.league_id = betting_outcomes.league_id
      and (
        market.status <> 'draft'
        or public.is_platform_admin(auth.uid())
      )
  )
);

create policy "users read own league wallets"
on public.betting_wallets
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_league_member(league_id, auth.uid())
);

create policy "users read own league bets"
on public.bet_slips
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_league_member(league_id, auth.uid())
);

create policy "users read own league bet legs"
on public.bet_legs
for select
to authenticated
using (
  public.is_league_member(league_id, auth.uid())
  and exists (
    select 1
    from public.bet_slips slip
    where slip.id = bet_legs.slip_id
      and slip.league_id = bet_legs.league_id
      and slip.user_id = auth.uid()
  )
);

create policy "members read result versions"
on public.game_result_versions
for select
to authenticated
using (public.is_league_member(league_id, auth.uid()));

create policy "league admins read settlement summaries"
on public.bet_settlement_runs
for select
to authenticated
using (
  public.is_league_admin(league_id, auth.uid())
  or public.is_platform_admin(auth.uid())
);

create policy "users read own league ledger"
on public.coin_ledger
for select
to authenticated
using (
  public.is_league_member(league_id, auth.uid())
  and exists (
    select 1
    from public.betting_wallets wallet
    where wallet.id = coin_ledger.wallet_id
      and wallet.league_id = coin_ledger.league_id
      and wallet.user_id = auth.uid()
  )
);

-- League discovery and lifecycle functions. These functions expose only the
-- limited metadata required by the corresponding confirmation screen.
create or replace function public.set_active_league(target_league_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_slug text;
begin
  if not public.is_league_member(target_league_id, auth.uid()) then
    raise exception 'You are not an active member of this league';
  end if;
  select slug into target_slug
  from public.leagues
  where id = target_league_id and status = 'active';
  if target_slug is null then raise exception 'League not found'; end if;
  update public.profiles
  set last_active_league_id = target_league_id
  where id = auth.uid();
  return target_slug;
end;
$$;

create or replace function public.create_league(
  league_name text,
  enable_fantasy boolean default true,
  enable_betting boolean default true,
  owner_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  clean_name text := trim(coalesce(league_name, ''));
  base_slug text;
  candidate_slug text;
  candidate_code text;
  suffix_number integer := 1;
  created_league_id uuid;
  created_season_id uuid;
  current_year integer;
  clean_timezone text := coalesce(nullif(trim(owner_timezone), ''), 'UTC');
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id
      and coalesce(profile.account_status, 'active') = 'active'
  ) then
    raise exception 'An active account is required';
  end if;
  if char_length(clean_name) not between 2 and 60 then
    raise exception 'League names must be between 2 and 60 characters';
  end if;
  if not exists (
    select 1 from pg_timezone_names zone where zone.name = clean_timezone
  ) then
    raise exception 'Choose a valid timezone';
  end if;
  if (
    select count(*)
    from public.leagues league
    where league.created_by = current_user_id
      and league.status = 'active'
  ) >= 3 then
    raise exception 'You can create up to three active leagues';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('create-league:' || current_user_id::text, 0));
  base_slug := public.slugify_league_name(clean_name);
  candidate_slug := base_slug;
  while exists (select 1 from public.leagues where slug = candidate_slug) loop
    suffix_number := suffix_number + 1;
    candidate_slug := left(base_slug, 64) || '-' || suffix_number::text;
  end loop;

  loop
    candidate_code := public.generate_league_code();
    exit when not exists (
      select 1 from public.leagues where join_code = candidate_code
    );
  end loop;

  insert into public.leagues(
    name,
    slug,
    join_code,
    timezone,
    fantasy_enabled,
    betting_enabled,
    created_by
  )
  values (
    clean_name,
    candidate_slug,
    candidate_code,
    clean_timezone,
    coalesce(enable_fantasy, true),
    coalesce(enable_betting, true),
    current_user_id
  )
  returning id into created_league_id;

  insert into public.league_memberships(
    league_id,
    user_id,
    role,
    status
  )
  values (created_league_id, current_user_id, 'owner', 'active');

  current_year := extract(year from now() at time zone clean_timezone)::integer;
  insert into public.seasons(
    league_id,
    name,
    format,
    start_date,
    end_date
  )
  values (
    created_league_id,
    current_year::text,
    'yearly',
    make_date(current_year, 1, 1),
    make_date(current_year, 12, 31)
  )
  returning id into created_season_id;

  insert into public.league_settings(
    league_id,
    season_mode,
    current_season_id
  )
  values (created_league_id, 'yearly', created_season_id);

  insert into public.betting_settings(league_id)
  values (created_league_id);

  perform public.initialize_betting_wallet(current_user_id, created_season_id);

  update public.profiles
  set last_active_league_id = created_league_id
  where id = current_user_id;

  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    action,
    after_data
  )
  values (
    created_league_id,
    current_user_id,
    'league_created',
    jsonb_build_object(
      'name', clean_name,
      'slug', candidate_slug,
      'timezone', clean_timezone,
      'fantasy_enabled', coalesce(enable_fantasy, true),
      'betting_enabled', coalesce(enable_betting, true)
    )
  );

  return jsonb_build_object(
    'id', created_league_id,
    'name', clean_name,
    'slug', candidate_slug,
    'join_code', candidate_code,
    'timezone', clean_timezone,
    'role', 'owner'
  );
end;
$$;

create or replace function public.preview_league_by_code(submitted_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_league public.leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into target_league
  from public.leagues
  where upper(join_code) = upper(trim(coalesce(submitted_code, '')))
    and status = 'active';
  if not found then raise exception 'That league code is not valid'; end if;

  return jsonb_build_object(
    'id', target_league.id,
    'name', target_league.name,
    'slug', target_league.slug,
    'member_count', (
      select count(*)
      from public.league_memberships membership
      where membership.league_id = target_league.id
        and membership.status = 'active'
    ),
    'fantasy_enabled', target_league.fantasy_enabled,
    'betting_enabled', target_league.betting_enabled,
    'already_member', public.is_league_member(target_league.id, auth.uid())
  );
end;
$$;

create or replace function public.request_to_join_league(submitted_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_league public.leagues%rowtype;
  request_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into target_league
  from public.leagues
  where upper(join_code) = upper(trim(coalesce(submitted_code, '')))
    and status = 'active';
  if not found then raise exception 'That league code is not valid'; end if;

  if public.is_league_member(target_league.id, auth.uid()) then
    return jsonb_build_object(
      'status', 'already_member',
      'league_id', target_league.id,
      'slug', target_league.slug
    );
  end if;

  select id into request_id
  from public.league_join_requests
  where league_id = target_league.id
    and user_id = auth.uid()
    and status = 'pending';

  if request_id is null then
    insert into public.league_join_requests(league_id, user_id)
    values (target_league.id, auth.uid())
    returning id into request_id;
  end if;

  return jsonb_build_object(
    'status', 'pending',
    'request_id', request_id,
    'league_id', target_league.id,
    'league_name', target_league.name
  );
end;
$$;

create or replace function public.review_league_join_request(
  target_request_id uuid,
  approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.league_join_requests%rowtype;
  target_slug text;
begin
  select * into target_request
  from public.league_join_requests
  where id = target_request_id
  for update;
  if not found then raise exception 'Join request not found'; end if;
  if target_request.status <> 'pending' then
    raise exception 'This join request has already been reviewed';
  end if;
  if not public.is_league_admin(target_request.league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;

  if coalesce(approve, false) then
    insert into public.league_memberships(
      league_id,
      user_id,
      role,
      status,
      invited_by,
      ended_at
    )
    values (
      target_request.league_id,
      target_request.user_id,
      'member',
      'active',
      auth.uid(),
      null
    )
    on conflict (league_id, user_id) do update
    set
      role = 'member',
      status = 'active',
      invited_by = excluded.invited_by,
      ended_at = null,
      joined_at = now();

    update public.league_join_requests
    set
      status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = target_request.id;
  else
    update public.league_join_requests
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = target_request.id;
  end if;

  select slug into target_slug
  from public.leagues
  where id = target_request.league_id;

  return jsonb_build_object(
    'status', case when approve then 'approved' else 'rejected' end,
    'league_id', target_request.league_id,
    'slug', target_slug,
    'user_id', target_request.user_id
  );
end;
$$;

create or replace function public.create_league_invite_link(
  target_league_id uuid,
  valid_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  raw_token text;
  token_digest text;
  invite_id uuid;
  target_slug text;
  expiration timestamptz;
begin
  if not public.is_league_member(target_league_id, auth.uid()) then
    raise exception 'Active league membership required';
  end if;
  if valid_hours is null or valid_hours not between 1 and 168 then
    raise exception 'Invite links can last between 1 hour and 7 days';
  end if;
  select slug into target_slug
  from public.leagues
  where id = target_league_id and status = 'active';
  if target_slug is null then raise exception 'League not found'; end if;

  raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  token_digest := encode(extensions.digest(raw_token, 'sha256'), 'hex');
  expiration := now() + make_interval(hours => valid_hours);

  insert into public.league_invite_links(
    league_id,
    token_hash,
    created_by,
    expires_at
  )
  values (target_league_id, token_digest, auth.uid(), expiration)
  returning id into invite_id;

  return jsonb_build_object(
    'id', invite_id,
    'league_id', target_league_id,
    'slug', target_slug,
    'token', raw_token,
    'expires_at', expiration
  );
end;
$$;

create or replace function public.preview_league_invite_link(submitted_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_invite public.league_invite_links%rowtype;
  target_league public.leagues%rowtype;
  token_digest text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  token_digest := encode(
    extensions.digest(trim(coalesce(submitted_token, '')), 'sha256'),
    'hex'
  );
  select * into target_invite
  from public.league_invite_links
  where token_hash = token_digest
    and revoked_at is null
    and used_at is null
    and expires_at > now();
  if not found then raise exception 'This invitation link is invalid or has expired'; end if;

  select * into target_league
  from public.leagues
  where id = target_invite.league_id
    and status = 'active';
  if not found then raise exception 'This league is not available'; end if;

  return jsonb_build_object(
    'id', target_league.id,
    'name', target_league.name,
    'slug', target_league.slug,
    'member_count', (
      select count(*)
      from public.league_memberships membership
      where membership.league_id = target_league.id
        and membership.status = 'active'
    ),
    'fantasy_enabled', target_league.fantasy_enabled,
    'betting_enabled', target_league.betting_enabled,
    'expires_at', target_invite.expires_at,
    'already_member', public.is_league_member(target_league.id, auth.uid())
  );
end;
$$;

create or replace function public.accept_league_invite_link(submitted_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_invite public.league_invite_links%rowtype;
  target_slug text;
  token_digest text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  token_digest := encode(
    extensions.digest(trim(coalesce(submitted_token, '')), 'sha256'),
    'hex'
  );
  select * into target_invite
  from public.league_invite_links
  where token_hash = token_digest
  for update;
  if not found
     or target_invite.revoked_at is not null
     or target_invite.used_at is not null
     or target_invite.expires_at <= now()
  then
    raise exception 'This invitation link is invalid or has expired';
  end if;

  if not exists (
    select 1 from public.leagues
    where id = target_invite.league_id and status = 'active'
  ) then
    raise exception 'This league is not available';
  end if;

  if not public.is_league_member(target_invite.league_id, auth.uid()) then
    insert into public.league_memberships(
      league_id,
      user_id,
      role,
      status,
      invited_by,
      ended_at
    )
    values (
      target_invite.league_id,
      auth.uid(),
      'member',
      'active',
      target_invite.created_by,
      null
    )
    on conflict (league_id, user_id) do update
    set
      role = 'member',
      status = 'active',
      invited_by = excluded.invited_by,
      ended_at = null,
      joined_at = now();
  end if;

  update public.league_invite_links
  set used_by = auth.uid(), used_at = now()
  where id = target_invite.id;

  update public.profiles
  set last_active_league_id = target_invite.league_id
  where id = auth.uid();

  select slug into target_slug
  from public.leagues
  where id = target_invite.league_id;

  return jsonb_build_object(
    'status', 'accepted',
    'league_id', target_invite.league_id,
    'slug', target_slug
  );
end;
$$;

create or replace function public.rotate_league_join_code(target_league_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate_code text;
begin
  if not public.is_league_admin(target_league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;
  loop
    candidate_code := public.generate_league_code();
    exit when not exists (
      select 1 from public.leagues where join_code = candidate_code
    );
  end loop;
  update public.leagues
  set join_code = candidate_code
  where id = target_league_id and status = 'active';
  if not found then raise exception 'League not found'; end if;
  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    action,
    after_data
  )
  values (
    target_league_id,
    auth.uid(),
    'league_join_code_rotated',
    jsonb_build_object('rotated', true)
  );
  return candidate_code;
end;
$$;

create or replace function public.update_league_options(
  target_league_id uuid,
  league_name text,
  enable_fantasy boolean,
  enable_betting boolean,
  unlock_betting_after_games integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_options jsonb;
begin
  if not public.is_league_admin(target_league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;
  if char_length(trim(coalesce(league_name, ''))) not between 2 and 60 then
    raise exception 'League names must be between 2 and 60 characters';
  end if;
  if unlock_betting_after_games is null or unlock_betting_after_games not between 0 and 50 then
    raise exception 'Choose a betting unlock point between 0 and 50 completed games';
  end if;
  select jsonb_build_object(
    'name', league.name,
    'fantasy_enabled', league.fantasy_enabled,
    'betting_enabled', league.betting_enabled,
    'betting_unlock_after_games', league.betting_unlock_after_games
  )
  into previous_options
  from public.leagues league
  where league.id = target_league_id
    and league.status = 'active'
  for update;
  if not found then raise exception 'League not found'; end if;

  update public.leagues
  set
    name = trim(league_name),
    fantasy_enabled = coalesce(enable_fantasy, true),
    betting_enabled = coalesce(enable_betting, true),
    betting_unlock_after_games = unlock_betting_after_games
  where id = target_league_id and status = 'active';

  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    action,
    before_data,
    after_data
  )
  values (
    target_league_id,
    auth.uid(),
    'league_options_updated',
    previous_options,
    jsonb_build_object(
      'name', trim(league_name),
      'fantasy_enabled', coalesce(enable_fantasy, true),
      'betting_enabled', coalesce(enable_betting, true),
      'betting_unlock_after_games', unlock_betting_after_games
    )
  );
end;
$$;

create or replace function public.set_league_member_role(
  target_league_id uuid,
  target_user_id uuid,
  make_admin boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_role text;
  next_role text := case when coalesce(make_admin, false) then 'admin' else 'member' end;
begin
  if not public.is_league_owner(target_league_id, auth.uid()) then
    raise exception 'Only the league owner can change admin roles';
  end if;
  select membership.role
  into previous_role
  from public.league_memberships membership
  where membership.league_id = target_league_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  for update;
  if not found then
    raise exception 'Active league member not found';
  end if;
  if previous_role = 'owner' then
    raise exception 'Transfer ownership before changing the owner role';
  end if;
  if previous_role = next_role then
    return;
  end if;

  update public.league_memberships
  set role = next_role
  where league_id = target_league_id
    and user_id = target_user_id
    and status = 'active';

  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    action,
    before_data,
    after_data
  )
  values (
    target_league_id,
    auth.uid(),
    'league_member_role_changed',
    jsonb_build_object('user_id', target_user_id, 'role', previous_role),
    jsonb_build_object('user_id', target_user_id, 'role', next_role)
  );
end;
$$;

create or replace function public.transfer_league_ownership(
  target_league_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner_id uuid := auth.uid();
  target_role text;
begin
  if not public.is_league_owner(target_league_id, current_owner_id) then
    raise exception 'Only the league owner can transfer ownership';
  end if;
  if target_user_id = current_owner_id then
    raise exception 'You already own this league';
  end if;

  select membership.role
  into target_role
  from public.league_memberships membership
  where membership.league_id = target_league_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  for update;
  if not found then
    raise exception 'Active league member not found';
  end if;

  update public.league_memberships
  set role = 'admin'
  where league_id = target_league_id
    and user_id = current_owner_id
    and role = 'owner'
    and status = 'active';

  update public.league_memberships
  set role = 'owner'
  where league_id = target_league_id
    and user_id = target_user_id
    and status = 'active';

  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    action,
    before_data,
    after_data
  )
  values (
    target_league_id,
    current_owner_id,
    'league_ownership_transferred',
    jsonb_build_object('owner_user_id', current_owner_id),
    jsonb_build_object('owner_user_id', target_user_id, 'previous_role', target_role)
  );
end;
$$;

create or replace function public.remove_league_member(
  target_league_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_is_owner boolean := public.is_league_owner(target_league_id, auth.uid());
  target_role text;
begin
  if not public.is_league_admin(target_league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'Use Leave league to remove yourself';
  end if;
  select membership.role
  into target_role
  from public.league_memberships membership
  where membership.league_id = target_league_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  for update;
  if not found then
    raise exception 'Active league member not found';
  end if;
  if target_role = 'owner' then
    raise exception 'Transfer ownership before removing the owner';
  end if;
  if target_role = 'admin' and not actor_is_owner then
    raise exception 'Only the league owner can remove an admin';
  end if;

  update public.league_memberships
  set status = 'removed', ended_at = now()
  where league_id = target_league_id
    and user_id = target_user_id;

  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    action,
    before_data,
    after_data
  )
  values (
    target_league_id,
    auth.uid(),
    'league_member_removed',
    jsonb_build_object('user_id', target_user_id, 'role', target_role),
    jsonb_build_object('user_id', target_user_id, 'status', 'removed')
  );
end;
$$;

create or replace function public.leave_league(target_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_member(target_league_id, auth.uid()) then
    raise exception 'Active league membership not found';
  end if;
  if public.is_league_owner(target_league_id, auth.uid()) then
    raise exception 'Transfer league ownership before leaving this league';
  end if;

  update public.league_memberships
  set status = 'left', ended_at = now()
  where league_id = target_league_id
    and user_id = auth.uid();

  update public.profiles profile
  set last_active_league_id = (
    select membership.league_id
    from public.league_memberships membership
    where membership.user_id = auth.uid()
      and membership.status = 'active'
    order by membership.joined_at
    limit 1
  )
  where profile.id = auth.uid()
    and profile.last_active_league_id = target_league_id;
end;
$$;

create or replace function public.archive_league(target_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_owner(target_league_id, auth.uid()) then
    raise exception 'Only the league owner can archive the league';
  end if;
  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    action,
    after_data
  )
  values (
    target_league_id,
    auth.uid(),
    'league_archived',
    jsonb_build_object('status', 'archived')
  );
  update public.leagues
  set status = 'archived', archived_at = now()
  where id = target_league_id and status = 'active';
  if not found then raise exception 'League not found'; end if;
end;
$$;

-- League-specific season controls.
create or replace function public.set_season_mode(
  target_league_id uuid,
  new_mode text,
  target_season_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_season public.seasons%rowtype;
  target_timezone text;
  current_year integer;
begin
  if not public.is_league_admin(target_league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;
  if new_mode not in ('yearly', 'custom') then raise exception 'Invalid season mode'; end if;
  select timezone into target_timezone from public.leagues where id = target_league_id;
  current_year := extract(year from now() at time zone coalesce(target_timezone, 'Asia/Beirut'))::integer;

  if new_mode = 'yearly' then
    insert into public.seasons(league_id, name, format, start_date, end_date)
    values (
      target_league_id,
      current_year::text,
      'yearly',
      make_date(current_year, 1, 1),
      make_date(current_year, 12, 31)
    )
    on conflict (league_id, format, start_date, end_date) do nothing;
    select * into selected_season
    from public.seasons
    where league_id = target_league_id
      and format = 'yearly'
      and (now() at time zone coalesce(target_timezone, 'Asia/Beirut'))::date
        between start_date and end_date
    limit 1;
  else
    select * into selected_season
    from public.seasons
    where id = target_season_id
      and league_id = target_league_id
      and format = 'custom';
    if not found then raise exception 'Choose a custom season first'; end if;
  end if;

  perform set_config('app.allow_final_transition', 'true', true);
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games game
  set season_id = (
    select season.id
    from public.seasons season
    where season.league_id = target_league_id
      and season.format = new_mode
      and (game.game_date at time zone coalesce(target_timezone, 'Asia/Beirut'))::date
        between season.start_date and season.end_date
    order by season.start_date desc
    limit 1
  )
  where game.league_id = target_league_id;

  update public.league_settings
  set
    season_mode = new_mode,
    current_season_id = selected_season.id,
    updated_at = now()
  where league_id = target_league_id;
end;
$$;

create or replace function public.create_custom_season(
  target_league_id uuid,
  season_name text,
  season_start date,
  season_end date,
  make_current boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_id uuid;
begin
  if not public.is_league_admin(target_league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;
  if char_length(trim(coalesce(season_name, ''))) not between 1 and 60 then
    raise exception 'Season name is required';
  end if;
  if season_start is null or season_end is null or season_end < season_start then
    raise exception 'Choose a valid season date range';
  end if;
  if exists (
    select 1
    from public.seasons
    where league_id = target_league_id
      and format = 'custom'
      and daterange(start_date, end_date, '[]')
        && daterange(season_start, season_end, '[]')
  ) then
    raise exception 'Custom season dates cannot overlap';
  end if;

  insert into public.seasons(league_id, name, format, start_date, end_date)
  values (
    target_league_id,
    trim(season_name),
    'custom',
    season_start,
    season_end
  )
  returning id into created_id;

  if coalesce(make_current, true) then
    perform public.set_season_mode(target_league_id, 'custom', created_id);
  end if;
  return created_id;
end;
$$;

create or replace function public.update_custom_season(
  target_league_id uuid,
  target_season_id uuid,
  season_name text,
  season_start date,
  season_end date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_mode text;
begin
  if not public.is_league_admin(target_league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;
  if char_length(trim(coalesce(season_name, ''))) not between 1 and 60 then
    raise exception 'Season name is required';
  end if;
  if season_start is null or season_end is null or season_end < season_start then
    raise exception 'Choose a valid season date range';
  end if;
  if not exists (
    select 1 from public.seasons
    where id = target_season_id
      and league_id = target_league_id
      and format = 'custom'
  ) then
    raise exception 'Custom season not found';
  end if;
  if exists (
    select 1
    from public.seasons
    where id <> target_season_id
      and league_id = target_league_id
      and format = 'custom'
      and daterange(start_date, end_date, '[]')
        && daterange(season_start, season_end, '[]')
  ) then
    raise exception 'Custom season dates cannot overlap';
  end if;

  update public.seasons
  set
    name = trim(season_name),
    start_date = season_start,
    end_date = season_end
  where id = target_season_id
    and league_id = target_league_id;

  select season_mode into current_mode
  from public.league_settings
  where league_id = target_league_id;
  if current_mode = 'custom' then
    perform public.set_season_mode(target_league_id, 'custom', target_season_id);
  end if;
end;
$$;

-- Admin readiness is deliberately boolean-only; it never exposes fantasy picks
-- or bet selections.
create or replace function public.get_league_readiness(
  target_league_id uuid,
  target_game_id uuid
)
returns table (
  user_id uuid,
  username text,
  fantasy_ready boolean,
  betting_ready boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_admin(target_league_id, auth.uid()) then
    raise exception 'League admin access required';
  end if;
  if not exists (
    select 1 from public.games
    where id = target_game_id and league_id = target_league_id
  ) then
    raise exception 'Game not found';
  end if;
  return query
  select
    membership.user_id,
    profile.username,
    exists (
      select 1
      from public.fantasy_squads squad
      where squad.league_id = target_league_id
        and squad.game_id = target_game_id
        and squad.user_id = membership.user_id
    ),
    exists (
      select 1
      from public.bet_slips slip
      where slip.league_id = target_league_id
        and slip.game_id = target_game_id
        and slip.user_id = membership.user_id
        and slip.status <> 'cashed_out'
    )
  from public.league_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.league_id = target_league_id
    and membership.status = 'active'
  order by lower(profile.username);
end;
$$;

create or replace function public.get_platform_league_stats()
returns table (
  league_id uuid,
  league_name text,
  league_slug text,
  status text,
  member_count bigint,
  admin_count bigint,
  player_count bigint,
  game_count bigint,
  final_game_count bigint,
  fantasy_squad_count bigint,
  bet_count bigint,
  notification_device_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'Platform admin access required';
  end if;
  return query
  select
    league.id,
    league.name,
    league.slug,
    league.status,
    (
      select count(*) from public.league_memberships membership
      where membership.league_id = league.id and membership.status = 'active'
    ),
    (
      select count(*) from public.league_memberships membership
      where membership.league_id = league.id
        and membership.status = 'active'
        and membership.role in ('owner', 'admin')
    ),
    (
      select count(*) from public.players player
      where player.league_id = league.id and player.archived_at is null
    ),
    (
      select count(*) from public.games game
      where game.league_id = league.id
    ),
    (
      select count(*) from public.games game
      where game.league_id = league.id and game.status = 'final'
    ),
    (
      select count(*) from public.fantasy_squads squad
      where squad.league_id = league.id
    ),
    (
      select count(*) from public.bet_slips slip
      where slip.league_id = league.id and slip.status <> 'cashed_out'
    ),
    (
      select count(distinct subscription.id)
      from public.league_memberships membership
      join public.push_subscriptions subscription on subscription.user_id = membership.user_id
      where membership.league_id = league.id and membership.status = 'active'
    )
  from public.leagues league
  order by league.created_at desc;
end;
$$;

-- A league admin must never receive platform account or notification powers.
revoke all on function public.get_admin_notification_stats() from authenticated;
revoke all on function public.admin_reactivate_account(uuid) from authenticated;

-- Old season RPCs are globally scoped and are no longer callable.
revoke all on function public.set_season_mode(text, uuid) from authenticated;
revoke all on function public.create_custom_season(text, date, date, boolean) from authenticated;
revoke all on function public.set_current_season(uuid) from authenticated;
revoke all on function public.update_custom_season(uuid, text, date, date) from authenticated;

revoke all on public.leagues from anon, authenticated;
revoke all on public.league_memberships from anon, authenticated;
revoke all on public.league_join_requests from anon, authenticated;
revoke all on public.league_invite_links from anon, authenticated;
revoke all on public.app_roles from anon, authenticated;
grant select on public.leagues to authenticated;
grant select on public.league_memberships to authenticated;
grant select on public.league_join_requests to authenticated;
grant select on public.app_roles to authenticated;
grant insert on public.players to authenticated;
grant insert, update, delete on public.games to authenticated;

revoke all on function public.is_platform_admin(uuid) from public;
revoke all on function public.is_league_member(uuid, uuid) from public;
revoke all on function public.is_league_admin(uuid, uuid) from public;
revoke all on function public.is_league_owner(uuid, uuid) from public;
revoke all on function public.current_league_id() from public;
grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;
grant execute on function public.is_league_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_league_admin(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_league_owner(uuid, uuid) to authenticated, service_role;
grant execute on function public.current_league_id() to authenticated, service_role;

revoke all on function public.set_active_league(uuid) from public;
revoke all on function public.get_league_member_directory(uuid) from public;
revoke all on function public.get_league_betting_public_settings(uuid) from public;
revoke all on function public.create_league(text, boolean, boolean, text) from public;
revoke all on function public.preview_league_by_code(text) from public;
revoke all on function public.request_to_join_league(text) from public;
revoke all on function public.review_league_join_request(uuid, boolean) from public;
revoke all on function public.create_league_invite_link(uuid, integer) from public;
revoke all on function public.preview_league_invite_link(text) from public;
revoke all on function public.accept_league_invite_link(text) from public;
revoke all on function public.rotate_league_join_code(uuid) from public;
revoke all on function public.update_league_options(uuid, text, boolean, boolean, integer) from public;
revoke all on function public.set_league_member_role(uuid, uuid, boolean) from public;
revoke all on function public.transfer_league_ownership(uuid, uuid) from public;
revoke all on function public.remove_league_member(uuid, uuid) from public;
revoke all on function public.leave_league(uuid) from public;
revoke all on function public.archive_league(uuid) from public;
revoke all on function public.set_season_mode(uuid, text, uuid) from public;
revoke all on function public.create_custom_season(uuid, text, date, date, boolean) from public;
revoke all on function public.update_custom_season(uuid, uuid, text, date, date) from public;
revoke all on function public.get_league_readiness(uuid, uuid) from public;
revoke all on function public.get_platform_league_stats() from public;
revoke all on function public.league_betting_availability(uuid) from public;

grant execute on function public.set_active_league(uuid) to authenticated;
grant execute on function public.get_league_member_directory(uuid) to authenticated;
grant execute on function public.get_league_betting_public_settings(uuid) to authenticated;
grant execute on function public.create_league(text, boolean, boolean, text) to authenticated;
grant execute on function public.preview_league_by_code(text) to authenticated;
grant execute on function public.request_to_join_league(text) to authenticated;
grant execute on function public.review_league_join_request(uuid, boolean) to authenticated;
grant execute on function public.create_league_invite_link(uuid, integer) to authenticated;
grant execute on function public.preview_league_invite_link(text) to authenticated;
grant execute on function public.accept_league_invite_link(text) to authenticated;
grant execute on function public.rotate_league_join_code(uuid) to authenticated;
grant execute on function public.update_league_options(uuid, text, boolean, boolean, integer) to authenticated;
grant execute on function public.set_league_member_role(uuid, uuid, boolean) to authenticated;
grant execute on function public.transfer_league_ownership(uuid, uuid) to authenticated;
grant execute on function public.remove_league_member(uuid, uuid) to authenticated;
grant execute on function public.leave_league(uuid) to authenticated;
grant execute on function public.archive_league(uuid) to authenticated;
grant execute on function public.set_season_mode(uuid, text, uuid) to authenticated;
grant execute on function public.create_custom_season(uuid, text, date, date, boolean) to authenticated;
grant execute on function public.update_custom_season(uuid, uuid, text, date, date) to authenticated;
grant execute on function public.get_league_readiness(uuid, uuid) to authenticated;
grant execute on function public.get_platform_league_stats() to authenticated;
grant execute on function public.league_betting_availability(uuid) to authenticated;

commit;
