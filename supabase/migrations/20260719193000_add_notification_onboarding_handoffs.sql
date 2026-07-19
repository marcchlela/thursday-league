-- Let an authenticated Safari session hand notification setup off to the
-- separately stored iOS Home Screen app session without sharing auth tokens.

create table if not exists public.notification_onboarding_handoffs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.notification_onboarding_handoffs enable row level security;

drop policy if exists "users manage own notification onboarding handoff"
  on public.notification_onboarding_handoffs;
create policy "users manage own notification onboarding handoff"
  on public.notification_onboarding_handoffs
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete
  on public.notification_onboarding_handoffs
  to authenticated;
