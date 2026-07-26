-- Controlled display-name update.
create or replace function public.update_own_username(new_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if length(trim(new_username)) < 2 then
    raise exception 'Name needs at least 2 characters';
  end if;
  update public.profiles set username = trim(new_username) where id = auth.uid();
end;
$$;

revoke all on function public.update_own_username(text) from public;
grant execute on function public.update_own_username(text) to authenticated;
