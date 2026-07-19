-- Carry the reason for a controlled correction through every edit until the
-- game is finalized again, so audit entries explain why the change happened.

alter table public.games add column if not exists correction_reason text;

create or replace function public.attach_active_correction_reason()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reason is null and new.game_id is not null then
    select game.correction_reason into new.reason
    from public.games game
    where game.id = new.game_id and game.correction_open;
  end if;
  return new;
end;
$$;

drop trigger if exists attach_correction_reason_to_audit on public.admin_audit_log;
create trigger attach_correction_reason_to_audit
before insert on public.admin_audit_log
for each row execute function public.attach_active_correction_reason();

create or replace function public.capture_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  current_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  relevant_row jsonb := coalesce(current_row, previous_row);
  target_game_id uuid;
  change_reason text;
begin
  if not public.is_admin()
     or coalesce(current_setting('app.suppress_generic_audit', true), 'false') = 'true'
  then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'games' then
    target_game_id := nullif(relevant_row ->> 'id', '')::uuid;
    change_reason := nullif(relevant_row ->> 'correction_reason', '');
  elsif tg_table_name in ('events', 'game_player_stats') then
    target_game_id := nullif(relevant_row ->> 'game_id', '')::uuid;
    select game.correction_reason into change_reason
    from public.games game where game.id = target_game_id and game.correction_open;
  end if;

  insert into public.admin_audit_log(admin_user_id, game_id, action, reason, before_data, after_data)
  values (auth.uid(), target_game_id, tg_table_name || '_' || lower(tg_op), change_reason, previous_row, current_row);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.set_game_status(target_game_id uuid, new_status public.game_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_game public.games%rowtype;
  lineup_count integer;
  status_reason text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into old_game from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if old_game.status = 'final' and new_status <> 'final' then raise exception 'Use reopen_final_game for controlled corrections'; end if;

  if new_status in ('live', 'final') then
    select count(*) into lineup_count from public.game_lineups where game_id = target_game_id and slot_index is not null;
    if lineup_count <> 10
       or exists (select 1 from (values ('A'::public.team_code), ('B'::public.team_code)) teams(team) where (select count(*) from public.game_lineups where game_id = target_game_id and team = teams.team) <> 5 or (select count(*) from public.game_lineups where game_id = target_game_id and team = teams.team and role = 'goalkeeper') <> 1)
    then raise exception 'Save an exact five-player lineup for each team first'; end if;
  end if;

  status_reason := case when old_game.correction_open then old_game.correction_reason else null end;
  perform set_config('app.allow_final_transition', 'true', true);
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games
  set status = new_status,
      finalized_at = case when new_status = 'final' then now() else finalized_at end,
      correction_open = case when new_status = 'final' then false else correction_open end,
      correction_reason = case when new_status = 'final' then null else correction_reason end
  where id = target_game_id;
  insert into public.admin_audit_log(admin_user_id, game_id, action, reason, before_data, after_data)
  values (auth.uid(), target_game_id, 'status_changed', status_reason, to_jsonb(old_game), jsonb_build_object('status', new_status, 'correction_completed', old_game.correction_open and new_status = 'final'));
end;
$$;

create or replace function public.reopen_final_game(target_game_id uuid, correction_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_game public.games%rowtype;
  clean_reason text := trim(coalesce(correction_reason, ''));
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(clean_reason) < 3 then raise exception 'A correction reason is required'; end if;
  select * into old_game from public.games where id = target_game_id and status = 'final' for update;
  if not found then raise exception 'Only a final game can be reopened'; end if;
  perform set_config('app.allow_final_transition', 'true', true);
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games set status = 'live', correction_open = true, correction_reason = clean_reason where id = target_game_id;
  insert into public.admin_audit_log(admin_user_id, game_id, action, reason, before_data, after_data)
  values (auth.uid(), target_game_id, 'final_game_reopened', clean_reason, to_jsonb(old_game), jsonb_build_object('status', 'live', 'correction_open', true, 'correction_reason', clean_reason));
end;
$$;
