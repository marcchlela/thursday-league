create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Subscriptions contain sensitive device information.
-- Browsers must use our secure server endpoint instead of accessing them directly.
revoke all on public.push_subscriptions from anon, authenticated;

grant select, insert, update, delete
  on public.push_subscriptions
  to service_role;