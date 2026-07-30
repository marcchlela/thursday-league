begin;

insert into auth.users(id, email, raw_user_meta_data)
values ('80000000-0000-4000-8000-000000000001', 'control-admin@example.test', '{"username":"control_admin"}');

update public.profiles
set is_admin = true
where id = '80000000-0000-4000-8000-000000000001';

insert into public.league_memberships(league_id, user_id, role)
values ('00000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'admin');

insert into public.players(id, name, default_position)
values ('81000000-0000-4000-8000-000000000001', 'Eligibility Test Player', 'outfield');

select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000001', true);

select public.admin_update_player_settings(
  '81000000-0000-4000-8000-000000000001',
  'Eligibility Test Player',
  'outfield',
  true,
  'guest',
  true,
  false
);

do $$
declare
  target_player public.players%rowtype;
begin
  select * into target_player
  from public.players
  where id = '81000000-0000-4000-8000-000000000001';

  if target_player.player_type <> 'guest' then
    raise exception 'Player type was not saved independently';
  end if;
  if target_player.fantasy_eligible is not true then
    raise exception 'Fantasy eligibility was not saved independently';
  end if;
  if target_player.individual_betting_eligible is not false then
    raise exception 'Individual betting eligibility was not saved independently';
  end if;
  if target_player.competition_eligible is not true then
    raise exception 'Compatibility eligibility should remain true when either feature is enabled';
  end if;
  if not exists (
    select 1
    from public.admin_audit_log
    where action = 'player_settings_updated'
      and after_data ->> 'player_type' = 'guest'
  ) then
    raise exception 'Player settings change was not audited';
  end if;
end;
$$;

do $$
declare
  controlled_table text;
begin
  foreach controlled_table in array array[
    'game_lineups',
    'events',
    'game_player_stats',
    'fantasy_squads',
    'fantasy_picks'
  ]
  loop
    if has_table_privilege('authenticated', format('public.%I', controlled_table), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', controlled_table), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', controlled_table), 'DELETE')
    then
      raise exception 'Authenticated still has direct write privileges on %', controlled_table;
    end if;
  end loop;
end;
$$;

do $$
declare
  controlled_table text;
begin
  foreach controlled_table in array array[
    'game_lineups',
    'events',
    'game_player_stats',
    'fantasy_squads',
    'fantasy_picks'
  ]
  loop
    if exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = controlled_table
        and cmd in ('INSERT', 'UPDATE', 'DELETE')
    ) then
      raise exception 'A direct write policy still exists on %', controlled_table;
    end if;
  end loop;
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'public.players', 'UPDATE')
     or has_table_privilege('authenticated', 'public.players', 'DELETE')
  then
    raise exception 'Player edits can still bypass the controlled admin functions';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'players'
      and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'A direct player update or delete policy still exists';
  end if;
end;
$$;

rollback;
