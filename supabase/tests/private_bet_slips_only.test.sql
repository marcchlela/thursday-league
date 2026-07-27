begin;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.get_public_bet_slips(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users can still browse public bet slips';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bet_slips'
      and policyname = 'slips owner readable'
      and qual like '%auth.uid()%'
  ) then
    raise exception 'The owner-only bet slip read policy is missing';
  end if;
end;
$$;

rollback;
