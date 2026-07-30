begin;

create table if not exists public.user_onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  onboarding_version smallint not null default 1 check (onboarding_version >= 1),
  introduction_completed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding enable row level security;

drop policy if exists "users read own onboarding progress"
  on public.user_onboarding;
create policy "users read own onboarding progress"
  on public.user_onboarding
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "users insert own onboarding progress"
  on public.user_onboarding;
create policy "users insert own onboarding progress"
  on public.user_onboarding
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users update own onboarding progress"
  on public.user_onboarding;
create policy "users update own onboarding progress"
  on public.user_onboarding
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.user_onboarding from public, anon;
grant select, insert, update on public.user_onboarding to authenticated;
grant all on public.user_onboarding to service_role;

create or replace function public.initialize_user_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_onboarding(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_onboarding_after_profile
  on public.profiles;
create trigger initialize_onboarding_after_profile
after insert on public.profiles
for each row execute function public.initialize_user_onboarding();

revoke all on function public.initialize_user_onboarding() from public;

-- Accounts that predate this migration have already used the application.
insert into public.user_onboarding(
  user_id,
  onboarding_version,
  introduction_completed_at,
  completed_at
)
select
  profile.id,
  1,
  now(),
  now()
from public.profiles profile
on conflict (user_id) do update
set onboarding_version = greatest(public.user_onboarding.onboarding_version, 1),
    introduction_completed_at = coalesce(
      public.user_onboarding.introduction_completed_at,
      excluded.introduction_completed_at
    ),
    completed_at = coalesce(
      public.user_onboarding.completed_at,
      excluded.completed_at
    ),
    updated_at = now();

create or replace function public.touch_user_onboarding_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_user_onboarding_updated_at
  on public.user_onboarding;
create trigger touch_user_onboarding_updated_at
before update on public.user_onboarding
for each row execute function public.touch_user_onboarding_updated_at();

revoke all on function public.touch_user_onboarding_updated_at() from public;

-- A raw invitation token has 192 bits of entropy. Logged-out recipients may use
-- it to see a deliberately small, non-sensitive preview before authenticating.
-- Accepting the invitation remains authenticated and single-use.
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
  current_user_id uuid := auth.uid();
begin
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
    'already_member', case
      when current_user_id is null then false
      else public.is_league_member(target_league.id, current_user_id)
    end
  );
end;
$$;

revoke all on function public.preview_league_invite_link(text) from public;
grant execute on function public.preview_league_invite_link(text)
  to anon, authenticated, service_role;

create or replace function public.get_my_league_join_requests()
returns table (
  id uuid,
  league_id uuid,
  league_name text,
  league_slug text,
  status text,
  fantasy_enabled boolean,
  betting_enabled boolean,
  requested_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  return query
  select
    request.id,
    request.league_id,
    league.name,
    league.slug,
    request.status,
    league.fantasy_enabled,
    league.betting_enabled,
    request.created_at,
    request.updated_at
  from public.league_join_requests request
  join public.leagues league on league.id = request.league_id
  where request.user_id = auth.uid()
    and request.status in ('pending', 'rejected')
    and league.status = 'active'
  order by request.updated_at desc
  limit 10;
end;
$$;

revoke all on function public.get_my_league_join_requests() from public;
grant execute on function public.get_my_league_join_requests()
  to authenticated, service_role;

commit;
