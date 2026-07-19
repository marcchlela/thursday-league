-- Expose notification adoption totals to admins without exposing subscription
-- endpoints or encryption keys to the browser.

create or replace function public.get_admin_notification_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'notification_users', (
      select count(distinct subscription.user_id)
      from public.push_subscriptions subscription
    ),
    'notification_devices', (
      select count(*)
      from public.push_subscriptions subscription
    )
  );
end;
$$;

revoke all on function public.get_admin_notification_stats() from public;
grant execute on function public.get_admin_notification_stats() to authenticated;
