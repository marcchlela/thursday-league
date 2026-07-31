begin;

do $$
begin
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'native_push_tokens'
      and relation.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on native push tokens';
  end if;

  if has_table_privilege('anon', 'public.native_push_tokens', 'SELECT')
     or has_table_privilege('authenticated', 'public.native_push_tokens', 'SELECT')
     or has_table_privilege('authenticated', 'public.native_push_tokens', 'INSERT')
     or has_table_privilege('authenticated', 'public.native_push_tokens', 'UPDATE')
     or has_table_privilege('authenticated', 'public.native_push_tokens', 'DELETE')
  then
    raise exception 'Browser or app clients can access native push tokens directly';
  end if;

  if not has_table_privilege('service_role', 'public.native_push_tokens', 'SELECT')
     or not has_table_privilege('service_role', 'public.native_push_tokens', 'INSERT')
     or not has_table_privilege('service_role', 'public.native_push_tokens', 'UPDATE')
     or not has_table_privilege('service_role', 'public.native_push_tokens', 'DELETE')
  then
    raise exception 'The trusted notification service cannot manage native push tokens';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_deliveries'
      and column_name = 'provider_ticket_id'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_deliveries'
      and column_name = 'provider_receipt_checked_at'
  ) then
    raise exception 'Native push receipt tracking columns are missing';
  end if;
end;
$$;

insert into auth.users(id, email, raw_user_meta_data)
values (
  '63000000-0000-4000-8000-000000000001',
  'native-push-security@example.test',
  '{"username":"native_push_security"}'
);

insert into public.native_push_tokens(
  user_id,
  expo_push_token,
  platform,
  installation_id
) values (
  '63000000-0000-4000-8000-000000000001',
  'ExpoPushToken[nativepushsecuritytoken1234567890]',
  'android',
  'nativepushsecurityinstallation0001'
);

update public.profiles
set account_status = 'deactivated', deactivated_at = now()
where id = '63000000-0000-4000-8000-000000000001';

do $$
begin
  if exists (
    select 1 from public.native_push_tokens
    where user_id = '63000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Deactivated accounts retain native push tokens';
  end if;
end;
$$;

rollback;
