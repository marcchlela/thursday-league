begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('90000000-0000-4000-8000-000000000001', 'security-admin@example.test', '{"username":"security_admin"}'),
  ('90000000-0000-4000-8000-000000000002', 'fantasy-owner@example.test', '{"username":"fantasy_owner"}'),
  ('90000000-0000-4000-8000-000000000003', 'fantasy-other@example.test', '{"username":"fantasy_other"}');

update public.profiles
set is_admin = true
where id = '90000000-0000-4000-8000-000000000001';

insert into public.games(id, game_date, status)
values ('91000000-0000-4000-8000-000000000001', now() + interval '1 day', 'draft');

insert into public.players(id, name, default_position) values
  ('92000000-0000-4000-8000-000000000001', 'Privacy Player 1', 'goalkeeper'),
  ('92000000-0000-4000-8000-000000000002', 'Privacy Player 2', 'outfield');

insert into public.fantasy_squads(id, user_id, game_id) values
  ('93000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001');

insert into public.fantasy_picks(id, squad_id, player_id, role, is_captain, slot_index) values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'goalkeeper', true, 0),
  ('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'outfield', true, 0);

do $$
declare
  readable_table text;
begin
  foreach readable_table in array array[
    'profiles',
    'players',
    'games',
    'game_lineups',
    'events',
    'game_player_stats',
    'fantasy_squads',
    'fantasy_picks'
  ]
  loop
    if not has_table_privilege(
      'authenticated',
      format('public.%I', readable_table),
      'SELECT'
    ) then
      raise exception 'Authenticated users cannot read the RLS-protected % table', readable_table;
    end if;
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
set local role authenticated;

-- Seeded historical squads remain visible after kickoff by design. Restrict
-- these assertions to the future game created above so they test pre-kickoff
-- privacy without counting legitimate historical rows.
do $$
begin
  if not exists (
    select 1
    from public.fantasy_squads
    where id = '93000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'A user cannot read their own pre-kickoff Fantasy squad';
  end if;
  if exists (
    select 1
    from public.fantasy_squads
    where id = '93000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'A user can read another user''s pre-kickoff Fantasy squad';
  end if;
  if not exists (
    select 1
    from public.fantasy_picks
    where id = '94000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'A user cannot read their own pre-kickoff Fantasy pick';
  end if;
  if exists (
    select 1
    from public.fantasy_picks
    where id = '94000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'A user can read another user''s pre-kickoff Fantasy pick';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
begin
  if (
    select count(*)
    from public.fantasy_squads
    where game_id = '91000000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'An administrator cannot inspect Fantasy readiness';
  end if;
  if (
    select count(*)
    from public.fantasy_picks
    where squad_id in (
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002'
    )
  ) <> 2 then
    raise exception 'An administrator cannot inspect Fantasy data';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.get_public_bet_slips(uuid)',
    'EXECUTE'
  ) then
    raise exception 'The removed public bet-slip endpoint is executable';
  end if;
  if has_table_privilege(
    'authenticated',
    'public.api_rate_limits',
    'SELECT'
  ) then
    raise exception 'Authenticated users can inspect API rate-limit buckets';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.consume_api_rate_limit(text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users can bypass the server rate limiter';
  end if;
end;
$$;

reset role;

do $$
begin
  if not public.consume_api_rate_limit(repeat('a', 64), 2, 60) then
    raise exception 'First rate-limit attempt should pass';
  end if;
  if not public.consume_api_rate_limit(repeat('a', 64), 2, 60) then
    raise exception 'Second rate-limit attempt should pass';
  end if;
  if public.consume_api_rate_limit(repeat('a', 64), 2, 60) then
    raise exception 'Third rate-limit attempt should be blocked';
  end if;
end;
$$;

rollback;
