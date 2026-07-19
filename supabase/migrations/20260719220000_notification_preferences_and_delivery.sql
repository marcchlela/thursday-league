-- Per-user notification choices and privacy-safe delivery tracking.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  new_game boolean not null default true,
  lineups_ready boolean not null default true,
  final_results boolean not null default true,
  fantasy_deadline boolean not null default true,
  fantasy_reminder_minutes integer not null default 120
    check (fantasy_reminder_minutes in (30, 60, 120, 180, 360, 1440)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_preferences(user_id)
select profile.id from public.profiles profile
on conflict (user_id) do nothing;

create or replace function public.create_default_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_preferences(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_notification_preferences on public.profiles;
create trigger create_profile_notification_preferences
after insert on public.profiles
for each row execute function public.create_default_notification_preferences();

drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();

alter table public.notification_preferences enable row level security;
drop policy if exists "users read own notification preferences" on public.notification_preferences;
drop policy if exists "users insert own notification preferences" on public.notification_preferences;
drop policy if exists "users update own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());
create policy "users insert own notification preferences"
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());
create policy "users update own notification preferences"
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.notification_preferences to authenticated;

create table if not exists public.notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null check (notification_type in ('new_game', 'lineups_ready', 'final_results', 'fantasy_deadline')),
  game_id uuid references public.games(id) on delete set null,
  title text not null,
  body text not null,
  target_url text not null default '/',
  tag text,
  source text not null default 'admin' check (source in ('admin', 'scheduled')),
  dedupe_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.notification_dispatches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'expired', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_message text,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_dispatches_created_idx
  on public.notification_dispatches(created_at desc);
create index if not exists notification_deliveries_dispatch_idx
  on public.notification_deliveries(dispatch_id, status);
create index if not exists notification_deliveries_subscription_idx
  on public.notification_deliveries(subscription_id);

drop trigger if exists notification_deliveries_touch_updated_at on public.notification_deliveries;
create trigger notification_deliveries_touch_updated_at
before update on public.notification_deliveries
for each row execute function public.touch_updated_at();

alter table public.notification_dispatches enable row level security;
alter table public.notification_deliveries enable row level security;
drop policy if exists "admins read notification dispatches" on public.notification_dispatches;
drop policy if exists "admins read notification deliveries" on public.notification_deliveries;
create policy "admins read notification dispatches"
  on public.notification_dispatches for select to authenticated using (public.is_admin());
create policy "admins read notification deliveries"
  on public.notification_deliveries for select to authenticated using (public.is_admin());

revoke all on public.notification_dispatches from anon, authenticated;
revoke all on public.notification_deliveries from anon, authenticated;
grant select on public.notification_dispatches, public.notification_deliveries to authenticated;
grant select, insert, update, delete on public.notification_dispatches, public.notification_deliveries to service_role;
