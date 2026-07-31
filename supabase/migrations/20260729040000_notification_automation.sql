-- Multi-league notification events, platform-only delivery diagnostics, and
-- indexes used by automatic recovery of failed custom announcements.

alter table public.notification_preferences
  add column if not exists join_request boolean not null default true,
  add column if not exists join_approved boolean not null default true,
  add column if not exists betting_unlocked boolean not null default true,
  add column if not exists matchday_reminder boolean not null default true;

alter table public.notification_dispatches
  drop constraint if exists notification_dispatches_notification_type_check;
alter table public.notification_dispatches
  add constraint notification_dispatches_notification_type_check
  check (
    notification_type in (
      'new_game',
      'lineups_ready',
      'final_results',
      'fantasy_deadline',
      'announcement',
      'join_request',
      'join_approved',
      'betting_unlocked',
      'matchday_reminder'
    )
  );

drop policy if exists "users read own notification deliveries"
  on public.notification_deliveries;
drop policy if exists "platform reads notification deliveries"
  on public.notification_deliveries;
create policy "platform reads notification deliveries"
  on public.notification_deliveries
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

create index if not exists notification_deliveries_failed_retry_idx
  on public.notification_deliveries(last_attempt_at, attempt_count, dispatch_id)
  where status = 'failed';

-- Server routes use the service role for authenticated authorization checks,
-- recipient selection, scheduled work, and platform reporting. RLS bypass
-- alone is not a table privilege, so retain explicit read access while writes
-- remain limited to the tables/functions that grant them separately.
grant select on all tables in schema public to service_role;
