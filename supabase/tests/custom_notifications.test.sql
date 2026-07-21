begin;

insert into auth.users(id, email, raw_user_meta_data)
values ('60000000-0000-4000-8000-000000000001', 'announcement-admin@example.test', '{"username":"announcement_admin"}');

do $$
begin
  if not coalesce((
    select announcements
    from public.notification_preferences
    where user_id = '60000000-0000-4000-8000-000000000001'
  ), false) then raise exception 'Announcements were not enabled by default'; end if;
end;
$$;

insert into public.notification_dispatches(
  notification_type, title, body, target_url, source, created_by
) values (
  'announcement', 'Thursday update', 'Lineups will be posted soon.', '/fantasy?tab=set', 'admin',
  '60000000-0000-4000-8000-000000000001'
);

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
