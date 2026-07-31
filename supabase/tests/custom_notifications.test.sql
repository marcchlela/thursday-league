begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'app_roles',
    'leagues',
    'league_memberships',
    'games',
    'notification_preferences'
  ]
  loop
    if not has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') then
      raise exception 'The backend service cannot read public.%', table_name;
    end if;
  end loop;
end;
$$;

insert into auth.users(id, email, raw_user_meta_data)
values ('60000000-0000-4000-8000-000000000001', 'announcement-admin@example.test', '{"username":"announcement_admin"}');

insert into public.league_memberships(league_id, user_id, role)
values ('00000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'admin');

do $$
begin
  if not coalesce((
    select announcements
    from public.notification_preferences
    where user_id = '60000000-0000-4000-8000-000000000001'
  ), false) then raise exception 'Announcements were not enabled by default'; end if;
  if not coalesce((
    select join_request
    from public.notification_preferences
    where user_id = '60000000-0000-4000-8000-000000000001'
  ), false) then raise exception 'Join request notifications were not enabled by default'; end if;
  if not coalesce((
    select matchday_reminder
    from public.notification_preferences
    where user_id = '60000000-0000-4000-8000-000000000001'
  ), false) then raise exception 'Matchday reminders were not enabled by default'; end if;
end;
$$;

insert into public.notification_dispatches(
  id, league_id, notification_type, title, body, target_url, source, created_by
) values (
  '61000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'announcement', 'Thursday update', 'Lineups will be posted soon.', '/fantasy?tab=set', 'admin',
  '60000000-0000-4000-8000-000000000001'
);

insert into public.notification_deliveries(
  id, league_id, dispatch_id, user_id, status, attempt_count, error_message
) values (
  '62000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'failed',
  1,
  'Provider unavailable'
);

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
begin
  if exists (
    select 1 from public.notification_deliveries
    where id = '62000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'A league admin can read private delivery failures';
  end if;
end;
$$;
reset role;

insert into public.app_roles(user_id, role)
values ('60000000-0000-4000-8000-000000000001', 'platform_admin');
set local role authenticated;
do $$
begin
  if not exists (
    select 1 from public.notification_deliveries
    where id = '62000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'The platform owner cannot inspect notification failures';
  end if;
end;
$$;
reset role;

insert into public.notification_dispatches(
  league_id, notification_type, title, body, target_url, source, created_by
) values
  ('00000000-0000-4000-8000-000000000001', 'join_request', 'New join request', 'A player requested to join.', '/admin?section=league', 'scheduled', null),
  ('00000000-0000-4000-8000-000000000001', 'join_approved', 'You joined', 'Your request was approved.', '/', 'scheduled', null),
  ('00000000-0000-4000-8000-000000000001', 'betting_unlocked', 'Betting unlocked', 'Betting is now open.', '/betting', 'scheduled', null),
  ('00000000-0000-4000-8000-000000000001', 'matchday_reminder', 'Matchday', 'Your league plays today.', '/games', 'scheduled', null);

do $$
begin
  begin
    insert into public.notification_dispatches(notification_type, title, body)
    values ('unsafe_custom_type', 'Invalid', 'This must not be accepted.');
    raise exception 'Expected unsupported notification type rejection';
  exception when others then
    if sqlerrm = 'Expected unsupported notification type rejection' then raise; end if;
  end;
end;
$$;

rollback;
