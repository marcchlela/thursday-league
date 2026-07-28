begin;

do $$
declare
  admin_id uuid := '89000000-0000-4000-8000-000000000001';
  target_game_id uuid := '89000000-0000-4000-8000-000000000002';
  target_generation_id uuid := '89000000-0000-4000-8000-000000000003';
  target_market_id uuid := '89000000-0000-4000-8000-000000000004';
begin
  insert into auth.users(
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    admin_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'model-history-admin@example.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'::jsonb,
    now(),
    now()
  );

  update public.profiles
  set username = 'model-history-admin', is_admin = true
  where id = admin_id;

  insert into public.games(id, game_date, status)
  values (target_game_id, now() + interval '1 day', 'upcoming');

  insert into public.odds_generation_runs(
    id, game_id, model_version, input_snapshot, generated_by
  ) values (
    target_generation_id,
    target_game_id,
    'model-history-test',
    '{"predictions":{"expected_goals_A":3.1,"expected_goals_B":2.8}}',
    admin_id
  );

  insert into public.betting_markets(
    id, game_id, generation_run_id, market_key, market_type, title, status
  ) values (
    target_market_id,
    target_game_id,
    target_generation_id,
    'match-result',
    'match_result',
    'Match result',
    'draft'
  );

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform public.admin_delete_betting_markets(target_game_id);

  if exists (select 1 from public.betting_markets where id = target_market_id) then
    raise exception 'The replaceable market was not deleted';
  end if;

  if not exists (
    select 1
    from public.odds_generation_runs
    where id = target_generation_id
      and input_snapshot -> 'predictions' ->> 'expected_goals_A' = '3.1'
  ) then
    raise exception 'The pre-kickoff prediction snapshot was deleted';
  end if;

  if not exists (
    select 1
    from public.admin_audit_log
    where game_id = target_game_id
      and action = 'betting_markets_deleted'
      and after_data ->> 'preserved_generation_count' = '1'
  ) then
    raise exception 'The preserved prediction count was not audited';
  end if;
end;
$$;

rollback;
