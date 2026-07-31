begin;

insert into auth.users(id, email, raw_user_meta_data) values
  (
    'c0000000-0000-4000-8000-000000000001',
    'onboarding-one@example.test',
    '{"username":"onboarding_one"}'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'onboarding-two@example.test',
    '{"username":"onboarding_two"}'
  );

do $$
begin
  if not exists (
    select 1
    from public.user_onboarding
    where user_id = 'c0000000-0000-4000-8000-000000000001'
      and introduction_completed_at is null
      and completed_at is null
  ) then
    raise exception 'A new account did not receive resumable onboarding progress';
  end if;

  if has_table_privilege('anon', 'public.user_onboarding', 'SELECT') then
    raise exception 'Anonymous visitors can read onboarding progress';
  end if;

  if not has_function_privilege(
    'anon',
    'public.preview_league_invite_link(text)',
    'EXECUTE'
  ) then
    raise exception 'Logged-out invite preview is unavailable';
  end if;

  if has_function_privilege(
    'anon',
    'public.accept_league_invite_link(text)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous visitors can accept league invitations';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  'c0000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*)
    from public.user_onboarding
  ) <> 1 then
    raise exception 'A user can read another account onboarding progress';
  end if;
end;
$$;

update public.user_onboarding
set introduction_completed_at = now()
where user_id = 'c0000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1
    from public.user_onboarding
    where user_id = 'c0000000-0000-4000-8000-000000000001'
      and introduction_completed_at is not null
  ) then
    raise exception 'A user cannot save their own onboarding progress';
  end if;
end;
$$;

reset role;
rollback;
