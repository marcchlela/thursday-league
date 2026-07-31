begin;

-- Betting needs a consistent cold start so that every league reaches the same
-- minimum data threshold. League admins may enable or disable the feature, but
-- they cannot shorten or extend its three-game unlock period.
update public.leagues
set betting_unlock_after_games = 3
where betting_unlock_after_games <> 3;

alter table public.leagues
  alter column betting_unlock_after_games set default 3;

alter table public.leagues
  add constraint leagues_betting_unlock_fixed_check
  check (betting_unlock_after_games = 3);

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
    betting_unlock_after_games = 3
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
      'betting_unlock_after_games', 3
    )
  );
end;
$$;

comment on column public.leagues.betting_unlock_after_games is
  'Fixed platform-wide at three completed games; league admins may not configure this threshold.';

commit;
