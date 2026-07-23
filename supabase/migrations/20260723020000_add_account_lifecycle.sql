-- Account lifecycle controls preserve historical league records.
-- Deactivation blocks login but remains reversible by an administrator.
-- Deletion removes access and personal settings, then anonymizes the profile
-- so fantasy and betting history does not disappear from past results.

alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'deactivated', 'deleted')),
  add column if not exists deactivated_at timestamptz,
  add column if not exists deleted_at timestamptz;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_admin = true
      and profile.account_status = 'active'
  );
$$;

create or replace function public.deactivate_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;
  if current_profile.account_status = 'deleted' then
    raise exception 'This account has already been deleted';
  end if;
  if current_profile.is_admin and not exists (
    select 1
    from public.profiles
    where id <> current_user_id
      and is_admin = true
      and account_status = 'active'
  ) then
    raise exception 'Assign another active administrator before deactivating this account';
  end if;

  delete from public.push_subscriptions where user_id = current_user_id;

  update public.profiles
  set
    account_status = 'deactivated',
    deactivated_at = now()
  where id = current_user_id;

  update auth.users
  set
    banned_until = '9999-12-31 23:59:59+00'::timestamptz,
    updated_at = now()
  where id = current_user_id;

  return jsonb_build_object('status', 'deactivated');
end;
$$;

create or replace function public.delete_own_account(delete_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles%rowtype;
  deleted_username text;
  previous_avatar_path text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if delete_confirmation is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm account deletion';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;
  if current_profile.account_status = 'deleted' then
    return jsonb_build_object('status', 'deleted', 'avatar_path', null);
  end if;
  if current_profile.is_admin and not exists (
    select 1
    from public.profiles
    where id <> current_user_id
      and is_admin = true
      and account_status = 'active'
  ) then
    raise exception 'Assign another active administrator before deleting this account';
  end if;

  previous_avatar_path := current_profile.avatar_path;
  deleted_username := 'deleted_' || substring(replace(current_user_id::text, '-', '') from 1 for 20);

  delete from public.notification_deliveries where user_id = current_user_id;
  delete from public.push_subscriptions where user_id = current_user_id;
  delete from public.notification_preferences where user_id = current_user_id;
  delete from public.notification_onboarding_handoffs where user_id = current_user_id;

  update public.profiles
  set
    username = deleted_username,
    is_admin = false,
    avatar_path = null,
    account_status = 'deleted',
    deactivated_at = coalesce(deactivated_at, now()),
    deleted_at = now()
  where id = current_user_id;

  update auth.users
  set
    email = 'deleted-' || current_user_id::text || '@deleted.invalid',
    phone = null,
    raw_user_meta_data = jsonb_build_object('deleted', true),
    banned_until = '9999-12-31 23:59:59+00'::timestamptz,
    updated_at = now()
  where id = current_user_id;

  return jsonb_build_object(
    'status', 'deleted',
    'avatar_path', previous_avatar_path
  );
end;
$$;

create or replace function public.admin_reactivate_account(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into target_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;
  if target_profile.account_status = 'deleted' then
    raise exception 'Deleted accounts cannot be reactivated';
  end if;

  update public.profiles
  set
    account_status = 'active',
    deactivated_at = null
  where id = target_user_id;

  update auth.users
  set
    banned_until = null,
    updated_at = now()
  where id = target_user_id;

  insert into public.admin_audit_log (
    admin_user_id,
    action,
    reason,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'account_reactivated',
    'Administrator restored a deactivated account',
    jsonb_build_object('user_id', target_user_id, 'status', target_profile.account_status),
    jsonb_build_object('user_id', target_user_id, 'status', 'active')
  );

  return jsonb_build_object('status', 'active', 'user_id', target_user_id);
end;
$$;

revoke all on function public.deactivate_own_account() from public;
revoke all on function public.delete_own_account(text) from public;
revoke all on function public.admin_reactivate_account(uuid) from public;
grant execute on function public.deactivate_own_account() to authenticated;
grant execute on function public.delete_own_account(text) to authenticated;
grant execute on function public.admin_reactivate_account(uuid) to authenticated;
