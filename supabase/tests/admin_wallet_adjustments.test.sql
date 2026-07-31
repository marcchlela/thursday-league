begin;

do $$
declare
  admin_id uuid := '88000000-0000-4000-8000-000000000001';
  user_id uuid := '88000000-0000-4000-8000-000000000002';
  season_id uuid := '88000000-0000-4000-8000-000000000003';
  request_id uuid := '88000000-0000-4000-8000-000000000004';
  target_wallet_id uuid;
  starting_balance bigint;
  resulting_balance bigint;
  adjustment_count integer;
begin
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wallet-admin@example.test', crypt('test-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb, now(), now()),
    (user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wallet-user@example.test', crypt('test-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb, now(), now());

  update public.profiles set username = 'wallet-admin-test', is_admin = true where id = admin_id;
  update public.profiles set username = 'wallet-user-test', is_admin = false where id = user_id;
  insert into public.league_memberships(league_id, user_id, role)
  values
    ('00000000-0000-4000-8000-000000000001', admin_id, 'admin'),
    ('00000000-0000-4000-8000-000000000001', user_id, 'member');

  insert into public.seasons(id, name, format, start_date, end_date)
  values (season_id, 'Wallet test season', 'custom', date '2040-01-01', date '2040-12-31');

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  target_wallet_id := public.initialize_betting_wallet(user_id, season_id);
  select balance_units into starting_balance from public.betting_wallets where id = target_wallet_id;

  perform public.admin_adjust_betting_wallet(user_id, season_id, 1250, 'Correcting a local test balance', request_id);
  select balance_units into resulting_balance from public.betting_wallets where id = target_wallet_id;
  if resulting_balance <> starting_balance + 1250 then
    raise exception 'Wallet credit was not applied correctly';
  end if;

  -- Reusing the request ID must return the original result without applying it twice.
  perform public.admin_adjust_betting_wallet(user_id, season_id, 1250, 'Correcting a local test balance', request_id);
  select balance_units into resulting_balance from public.betting_wallets where id = target_wallet_id;
  if resulting_balance <> starting_balance + 1250 then
    raise exception 'Idempotent wallet request was applied twice';
  end if;

  select count(*) into adjustment_count
  from public.coin_ledger
  where wallet_id = target_wallet_id
    and entry_type = 'admin_adjustment';
  if adjustment_count <> 1 then
    raise exception 'Expected one admin adjustment ledger row, found %', adjustment_count;
  end if;

  if not exists (
    select 1 from public.admin_audit_log
    where action = 'wallet_adjusted'
      and admin_user_id = admin_id
      and reason = 'Correcting a local test balance'
  ) then
    raise exception 'Wallet adjustment audit row was not created';
  end if;

  begin
    perform public.admin_adjust_betting_wallet(user_id, season_id, 100, 'bad', gen_random_uuid());
    raise exception 'Short adjustment reason was accepted';
  exception when others then
    if sqlerrm = 'Short adjustment reason was accepted' then raise; end if;
  end;

  begin
    perform public.admin_adjust_betting_wallet(user_id, season_id, -(resulting_balance + 1), 'Prevent a negative test wallet', gen_random_uuid());
    raise exception 'Negative wallet balance was accepted';
  exception when others then
    if sqlerrm = 'Negative wallet balance was accepted' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', user_id::text, true);
  begin
    perform public.admin_adjust_betting_wallet(user_id, season_id, 100, 'Non-admin attempt should fail', gen_random_uuid());
    raise exception 'Non-admin wallet adjustment was accepted';
  exception when others then
    if sqlerrm = 'Non-admin wallet adjustment was accepted' then raise; end if;
  end;
end
$$;

rollback;
