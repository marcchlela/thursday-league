-- Single-league season model. Yearly mode is the default; the tables can gain a
-- league_id later as part of the planned multi-league migration.

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 60),
  format text not null check (format in ('yearly', 'custom')),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (format, start_date, end_date)
);

create table if not exists public.league_settings (
  id smallint primary key default 1 check (id = 1),
  season_mode text not null default 'yearly' check (season_mode in ('yearly', 'custom')),
  current_season_id uuid references public.seasons(id) on delete restrict,
  updated_at timestamptz not null default now()
);

insert into public.league_settings(id, season_mode)
values (1, 'yearly')
on conflict (id) do nothing;

alter table public.games add column if not exists season_id uuid references public.seasons(id) on delete restrict;
create index if not exists games_season_idx on public.games(season_id, game_date desc);

insert into public.seasons(name, format, start_date, end_date)
select year_value::text, 'yearly', make_date(year_value, 1, 1), make_date(year_value, 12, 31)
from (
  select distinct extract(year from game.game_date at time zone 'Asia/Beirut')::integer as year_value
  from public.games game
  union
  select extract(year from now() at time zone 'Asia/Beirut')::integer
) years
on conflict (format, start_date, end_date) do nothing;

do $$
begin
  -- Season assignment is metadata only. Explicitly pass through the final-game
  -- guard without opening any score, lineup, event, or fantasy records.
  perform set_config('app.allow_final_transition', 'true', true);
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games game
  set season_id = season.id
  from public.seasons season
  where season.format = 'yearly'
    and (game.game_date at time zone 'Asia/Beirut')::date between season.start_date and season.end_date
    and game.season_id is distinct from season.id;
end;
$$;

update public.league_settings
set current_season_id = (
  select season.id from public.seasons season
  where season.format = 'yearly'
    and (now() at time zone 'Asia/Beirut')::date between season.start_date and season.end_date
  limit 1
)
where id = 1 and current_season_id is null;

create or replace function public.assign_game_season()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_mode text;
  local_game_date date := (new.game_date at time zone 'Asia/Beirut')::date;
  game_year integer := extract(year from new.game_date at time zone 'Asia/Beirut')::integer;
begin
  select season_mode into selected_mode from public.league_settings where id = 1;
  if coalesce(selected_mode, 'yearly') = 'yearly' then
    insert into public.seasons(name, format, start_date, end_date)
    values (game_year::text, 'yearly', make_date(game_year, 1, 1), make_date(game_year, 12, 31))
    on conflict (format, start_date, end_date) do nothing;

    select season.id into new.season_id
    from public.seasons season
    where season.format = 'yearly' and local_game_date between season.start_date and season.end_date
    limit 1;
  else
    select season.id into new.season_id
    from public.seasons season
    where season.format = 'custom' and local_game_date between season.start_date and season.end_date
    order by season.start_date desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_game_season_on_write on public.games;
create trigger assign_game_season_on_write
before insert or update of game_date on public.games
for each row execute function public.assign_game_season();

create or replace function public.set_season_mode(new_mode text, target_season_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_season public.seasons%rowtype;
  before_settings jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if new_mode not in ('yearly', 'custom') then raise exception 'Invalid season mode'; end if;
  select to_jsonb(settings) into before_settings from public.league_settings settings where id = 1;

  if new_mode = 'yearly' then
    insert into public.seasons(name, format, start_date, end_date)
    select year_value::text, 'yearly', make_date(year_value, 1, 1), make_date(year_value, 12, 31)
    from (
      select distinct extract(year from game.game_date at time zone 'Asia/Beirut')::integer as year_value from public.games game
      union select extract(year from now() at time zone 'Asia/Beirut')::integer
    ) years
    on conflict (format, start_date, end_date) do nothing;

    select season.* into selected_season from public.seasons season
    where season.format = 'yearly'
      and (now() at time zone 'Asia/Beirut')::date between season.start_date and season.end_date
    limit 1;
    perform set_config('app.allow_final_transition', 'true', true);
    perform set_config('app.suppress_generic_audit', 'true', true);
    update public.games game set season_id = season.id
    from public.seasons season
    where season.format = 'yearly'
      and (game.game_date at time zone 'Asia/Beirut')::date between season.start_date and season.end_date;
  else
    select * into selected_season from public.seasons where id = target_season_id and format = 'custom';
    if not found then raise exception 'Choose a custom season first'; end if;
    perform set_config('app.allow_final_transition', 'true', true);
    perform set_config('app.suppress_generic_audit', 'true', true);
    update public.games game set season_id = (
      select season.id from public.seasons season
      where season.format = 'custom'
        and (game.game_date at time zone 'Asia/Beirut')::date between season.start_date and season.end_date
      order by season.start_date desc limit 1
    );
  end if;

  update public.league_settings set season_mode = new_mode, current_season_id = selected_season.id, updated_at = now() where id = 1;
  insert into public.admin_audit_log(admin_user_id, action, before_data, after_data)
  values (auth.uid(), 'season_mode_changed', before_settings, jsonb_build_object('season_mode', new_mode, 'current_season_id', selected_season.id));
end;
$$;

create or replace function public.create_custom_season(season_name text, season_start date, season_end date, make_current boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(season_name, ''))) < 1 then raise exception 'Season name is required'; end if;
  if season_start is null or season_end is null or season_end < season_start then raise exception 'Choose a valid season date range'; end if;
  if exists (select 1 from public.seasons where format = 'custom' and daterange(start_date, end_date, '[]') && daterange(season_start, season_end, '[]')) then
    raise exception 'Custom season dates cannot overlap';
  end if;

  insert into public.seasons(name, format, start_date, end_date)
  values (trim(season_name), 'custom', season_start, season_end)
  returning id into created_id;

  if make_current then perform public.set_season_mode('custom', created_id); end if;
  insert into public.admin_audit_log(admin_user_id, action, after_data)
  values (auth.uid(), 'season_created', jsonb_build_object('id', created_id, 'name', trim(season_name), 'start_date', season_start, 'end_date', season_end));
  return created_id;
end;
$$;

create or replace function public.set_current_season(target_season_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare selected_season public.seasons%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into selected_season from public.seasons where id = target_season_id;
  if not found then raise exception 'Season not found'; end if;
  perform public.set_season_mode(selected_season.format, selected_season.id);
end;
$$;

create or replace function public.update_custom_season(target_season_id uuid, season_name text, season_start date, season_end date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_season jsonb;
  current_mode text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(season_name, ''))) < 1 then raise exception 'Season name is required'; end if;
  if season_start is null or season_end is null or season_end < season_start then raise exception 'Choose a valid season date range'; end if;
  select to_jsonb(season) into before_season from public.seasons season where season.id = target_season_id and season.format = 'custom' for update;
  if before_season is null then raise exception 'Custom season not found'; end if;
  if exists (select 1 from public.seasons where id <> target_season_id and format = 'custom' and daterange(start_date, end_date, '[]') && daterange(season_start, season_end, '[]')) then
    raise exception 'Custom season dates cannot overlap';
  end if;

  update public.seasons set name = trim(season_name), start_date = season_start, end_date = season_end where id = target_season_id;
  select season_mode into current_mode from public.league_settings where id = 1;
  if current_mode = 'custom' then
    perform set_config('app.allow_final_transition', 'true', true);
    perform set_config('app.suppress_generic_audit', 'true', true);
    update public.games game set season_id = (
      select season.id from public.seasons season
      where season.format = 'custom'
        and (game.game_date at time zone 'Asia/Beirut')::date between season.start_date and season.end_date
      order by season.start_date desc limit 1
    );
  end if;
  insert into public.admin_audit_log(admin_user_id, action, before_data, after_data)
  values (auth.uid(), 'season_updated', before_season, jsonb_build_object('id', target_season_id, 'name', trim(season_name), 'start_date', season_start, 'end_date', season_end));
end;
$$;

alter table public.seasons enable row level security;
alter table public.league_settings enable row level security;
drop policy if exists "seasons readable" on public.seasons;
drop policy if exists "league settings readable" on public.league_settings;
create policy "seasons readable" on public.seasons for select to authenticated using (true);
create policy "league settings readable" on public.league_settings for select to authenticated using (true);
revoke all on public.seasons, public.league_settings from anon, authenticated;
grant select on public.seasons, public.league_settings to authenticated;
revoke all on function public.set_season_mode(text, uuid) from public;
revoke all on function public.create_custom_season(text, date, date, boolean) from public;
revoke all on function public.set_current_season(uuid) from public;
revoke all on function public.update_custom_season(uuid, text, date, date) from public;
grant execute on function public.set_season_mode(text, uuid) to authenticated;
grant execute on function public.create_custom_season(text, date, date, boolean) to authenticated;
grant execute on function public.set_current_season(uuid) to authenticated;
grant execute on function public.update_custom_season(uuid, text, date, date) to authenticated;
