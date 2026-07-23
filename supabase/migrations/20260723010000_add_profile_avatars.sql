-- League profile avatars are publicly viewable, while each user can only
-- upload files inside their own storage folder and update their own avatar path.

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile avatars readable" on storage.objects;
drop policy if exists "users upload own profile avatar" on storage.objects;
drop policy if exists "users update own profile avatar" on storage.objects;
drop policy if exists "users delete own profile avatar" on storage.objects;

create policy "profile avatars readable"
on storage.objects for select
to authenticated
using (bucket_id = 'profile-avatars');

create policy "users upload own profile avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users update own profile avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users delete own profile avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.set_profile_avatar(new_avatar_path text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  cleaned_path text := nullif(trim(new_avatar_path), '');
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if cleaned_path is not null and (
    length(cleaned_path) > 255
    or cleaned_path not like (current_user_id::text || '/avatar-%')
    or cleaned_path like '%..%'
  ) then
    raise exception 'Invalid avatar path';
  end if;

  update public.profiles
  set avatar_path = cleaned_path
  where id = current_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  return cleaned_path;
end;
$$;

revoke all on function public.set_profile_avatar(text) from public;
grant execute on function public.set_profile_avatar(text) to authenticated;
