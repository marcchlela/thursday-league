-- Admin-authored announcements use the existing tracked push delivery system
-- and have their own user preference.

alter table public.notification_preferences
  add column if not exists announcements boolean not null default true;

alter table public.notification_dispatches
  drop constraint if exists notification_dispatches_notification_type_check;
alter table public.notification_dispatches
  add constraint notification_dispatches_notification_type_check
  check (notification_type in ('new_game', 'lineups_ready', 'final_results', 'fantasy_deadline', 'announcement'));

