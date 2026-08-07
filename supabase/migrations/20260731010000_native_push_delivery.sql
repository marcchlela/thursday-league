-- Native iOS/Android push tokens are kept separately from browser Web Push
-- subscriptions. Only trusted server routes can read or mutate device tokens.

create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  installation_id text not null,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

create index if not exists native_push_tokens_user_idx
  on public.native_push_tokens(user_id);

alter table public.native_push_tokens enable row level security;
revoke all on public.native_push_tokens from anon, authenticated;
grant select, insert, update, delete on public.native_push_tokens to service_role;

alter table public.notification_deliveries
  add column if not exists native_push_token_id uuid
    references public.native_push_tokens(id) on delete set null;

alter table public.notification_deliveries
  drop constraint if exists notification_delivery_single_target;
alter table public.notification_deliveries
  add constraint notification_delivery_single_target
  check (not (subscription_id is not null and native_push_token_id is not null));

create index if not exists notification_deliveries_native_token_idx
  on public.notification_deliveries(native_push_token_id);

create or replace function public.remove_native_push_for_inactive_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.account_status, 'active') <> 'active'
     and coalesce(old.account_status, 'active') = 'active'
  then
    delete from public.native_push_tokens where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists remove_native_push_for_inactive_account on public.profiles;
create trigger remove_native_push_for_inactive_account
after update of account_status on public.profiles
for each row execute function public.remove_native_push_for_inactive_account();

revoke all on function public.remove_native_push_for_inactive_account() from public;

