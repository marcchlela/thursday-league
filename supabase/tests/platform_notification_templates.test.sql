begin;

do $$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.platform_notification_templates'::regclass
      and relrowsecurity
  ) then raise exception 'Notification template RLS is not enabled'; end if;

  if has_table_privilege('anon', 'public.platform_notification_templates', 'SELECT')
     or has_table_privilege('authenticated', 'public.platform_notification_templates', 'SELECT')
     or has_table_privilege('authenticated', 'public.platform_notification_templates', 'UPDATE') then
    raise exception 'Browser roles can access platform notification templates directly';
  end if;

  if not has_table_privilege('service_role', 'public.platform_notification_templates', 'SELECT')
     or not has_table_privilege('service_role', 'public.platform_notification_templates', 'INSERT')
     or not has_table_privilege('service_role', 'public.platform_notification_templates', 'UPDATE') then
    raise exception 'The protected server cannot manage notification templates';
  end if;

  if has_table_privilege('service_role', 'public.platform_notification_templates', 'DELETE') then
    raise exception 'Notification templates should not be deletable';
  end if;

  if (select count(*) from public.platform_notification_templates) <> 8 then
    raise exception 'Expected all eight automatic notification templates';
  end if;
end;
$$;

set local role service_role;
update public.platform_notification_templates
set title_template = 'Matchweek update', body_template = 'A new match is ready in {league_name}.', destination = 'games'
where notification_type = 'new_game';
reset role;

do $$
begin
  if not exists (
    select 1 from public.platform_notification_templates
    where notification_type = 'new_game'
      and title_template = 'Matchweek update'
      and destination = 'games'
  ) then raise exception 'The protected server could not update a template'; end if;

  begin
    update public.platform_notification_templates
    set destination = 'betting'
    where notification_type = 'join_request';
    raise exception 'Expected unsafe destination rejection';
  exception when check_violation then null;
  end;

  begin
    update public.platform_notification_templates
    set title_template = repeat('x', 61)
    where notification_type = 'new_game';
    raise exception 'Expected oversized title rejection';
  exception when check_violation then null;
  end;
end;
$$;

rollback;
