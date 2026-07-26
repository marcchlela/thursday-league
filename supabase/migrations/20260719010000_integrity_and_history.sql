-- Integrity, transactional saves, historical protection, and player archiving.

alter table public.players add column if not exists archived_at timestamptz;
alter table public.games add column if not exists finalized_at timestamptz;
alter table public.games add column if not exists correction_open boolean not null default false;
alter table public.game_lineups add column if not exists slot_index integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by game_id, team
      order by case when role = 'goalkeeper' then 0 else 1 end, created_at, id
    ) - 1 as position
  from public.game_lineups
)
update public.game_lineups lineup
set slot_index = ranked.position
from ranked
where lineup.id = ranked.id
  and lineup.slot_index is null
  and ranked.position between 0 and 4;

do $$ begin
  alter table public.game_lineups
    add constraint game_lineups_slot_range check (slot_index is null or slot_index between 0 and 4);
exception when duplicate_object then null;
end $$;

create unique index if not exists game_lineups_team_slot_unique
  on public.game_lineups(game_id, team, slot_index)
  where slot_index is not null;

-- Historical player references must never disappear through a cascade delete.
alter table public.game_lineups drop constraint if exists game_lineups_player_id_fkey;
alter table public.game_lineups add constraint game_lineups_player_id_fkey foreign key (player_id) references public.players(id) on delete restrict;
alter table public.events drop constraint if exists events_player_id_fkey;
alter table public.events add constraint events_player_id_fkey foreign key (player_id) references public.players(id) on delete restrict;
alter table public.game_player_stats drop constraint if exists game_player_stats_player_id_fkey;
alter table public.game_player_stats add constraint game_player_stats_player_id_fkey foreign key (player_id) references public.players(id) on delete restrict;
alter table public.fantasy_picks drop constraint if exists fantasy_picks_player_id_fkey;
alter table public.fantasy_picks add constraint fantasy_picks_player_id_fkey foreign key (player_id) references public.players(id) on delete restrict;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.profiles(id) on delete set null,
  game_id uuid references public.games(id) on delete set null,
  action text not null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log" on public.admin_audit_log for select to authenticated using (public.is_admin());
grant select on public.admin_audit_log to authenticated;
create index if not exists admin_audit_log_game_idx on public.admin_audit_log(game_id, created_at desc);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);

-- Record ordinary admin edits as well as the semantic actions logged by the RPCs below.
create or replace function public.capture_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  current_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  relevant_row jsonb := coalesce(current_row, previous_row);
  target_game_id uuid;
begin
  if not public.is_admin()
     or coalesce(current_setting('app.suppress_generic_audit', true), 'false') = 'true'
  then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'games' and tg_op <> 'DELETE' then
    target_game_id := nullif(relevant_row ->> 'id', '')::uuid;
  elsif tg_table_name in ('events', 'game_player_stats') then
    target_game_id := nullif(relevant_row ->> 'game_id', '')::uuid;
  end if;

  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (auth.uid(), target_game_id, tg_table_name || '_' || lower(tg_op), previous_row, current_row);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_player_changes on public.players;
create trigger audit_player_changes after insert or update on public.players
for each row execute function public.capture_admin_change();
drop trigger if exists audit_game_changes on public.games;
create trigger audit_game_changes after insert or update or delete on public.games
for each row execute function public.capture_admin_change();
drop trigger if exists audit_event_changes on public.events;
create trigger audit_event_changes after insert or update or delete on public.events
for each row execute function public.capture_admin_change();
drop trigger if exists audit_player_stat_changes on public.game_player_stats;
create trigger audit_player_stat_changes after insert or update or delete on public.game_player_stats
for each row execute function public.capture_admin_change();

create or replace function public.guard_final_game_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game_id uuid;
  target_status public.game_status;
begin
  target_game_id := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  select status into target_status from public.games where id = target_game_id;
  if target_status = 'final' then
    raise exception 'Final games are locked. Reopen the game for a controlled correction first.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_final_lineups on public.game_lineups;
create trigger protect_final_lineups before insert or update or delete on public.game_lineups
for each row execute function public.guard_final_game_records();
drop trigger if exists protect_final_events on public.events;
create trigger protect_final_events before insert or update or delete on public.events
for each row execute function public.guard_final_game_records();
drop trigger if exists protect_final_player_stats on public.game_player_stats;
create trigger protect_final_player_stats before insert or update or delete on public.game_player_stats
for each row execute function public.guard_final_game_records();

create or replace function public.guard_final_game_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_final_transition', true), 'false') = 'true' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' and old.status = 'final' then
    raise exception 'Final games cannot be deleted. Reopen for correction if necessary.';
  end if;
  if tg_op = 'UPDATE' and (old.status = 'final' or new.status = 'final') then
    raise exception 'Use the controlled game status function to finalize or reopen a game.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_final_game on public.games;
create trigger protect_final_game before update or delete on public.games
for each row execute function public.guard_final_game_row();

create or replace function public.save_game_lineup(target_game_id uuid, submitted_lineup jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before_state jsonb;
  submitted_count integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if jsonb_typeof(submitted_lineup) <> 'array' then raise exception 'Lineup must be an array'; end if;
  if not exists (select 1 from public.games where id = target_game_id and status <> 'final') then
    raise exception 'Game not found or final game is locked';
  end if;

  select count(*) into submitted_count
  from jsonb_to_recordset(submitted_lineup) as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer);
  if submitted_count <> 10 then raise exception 'A lineup must contain exactly 10 players'; end if;

  if (select count(distinct item.player_id) from jsonb_to_recordset(submitted_lineup) as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer)) <> 10 then
    raise exception 'Every lineup player must be unique';
  end if;

  if exists (
    select 1
    from (values ('A'::public.team_code), ('B'::public.team_code)) teams(team)
    where (select count(*) from jsonb_to_recordset(submitted_lineup) as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer) where item.team = teams.team) <> 5
       or (select count(distinct item.slot_index) from jsonb_to_recordset(submitted_lineup) as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer) where item.team = teams.team and item.slot_index between 0 and 4) <> 5
       or (select count(*) from jsonb_to_recordset(submitted_lineup) as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer) where item.team = teams.team and item.role = 'goalkeeper') <> 1
  ) then
    raise exception 'Each team needs exactly five unique slots: one goalkeeper and four outfield players';
  end if;

  if (select count(*) from public.players player join jsonb_to_recordset(submitted_lineup) as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer) on item.player_id = player.id where player.active and player.archived_at is null) <> 10 then
    raise exception 'Lineups can only contain active, non-archived players';
  end if;

  select coalesce(jsonb_agg(to_jsonb(lineup) order by lineup.team, lineup.slot_index), '[]'::jsonb)
  into before_state from public.game_lineups lineup where lineup.game_id = target_game_id;

  delete from public.game_lineups where game_id = target_game_id;
  insert into public.game_lineups(game_id, player_id, team, role, slot_index)
  select target_game_id, item.player_id, item.team, item.role, item.slot_index
  from jsonb_to_recordset(submitted_lineup) as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer);

  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games set status = 'draft' where id = target_game_id and status = 'upcoming';
  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (auth.uid(), target_game_id, 'lineup_replaced', before_state, submitted_lineup);
end;
$$;

create or replace function public.save_fantasy_squad(target_game_id uuid, submitted_picks jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_squad_id uuid;
  has_goalkeeper boolean;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(submitted_picks) <> 'array' then raise exception 'Picks must be an array'; end if;
  if not exists (
    select 1 from public.games
    where id = target_game_id and status in ('upcoming', 'draft') and now() < game_date
  ) then raise exception 'Fantasy is locked for this game'; end if;

  if (select count(*) from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer)) <> 5
     or (select count(distinct pick.player_id) from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer)) <> 5
     or (select count(distinct pick.slot_index) from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer) where pick.slot_index between 0 and 4) <> 5
     or (select count(*) from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer) where pick.is_captain) <> 1
  then raise exception 'Pick exactly five unique players in five slots and choose one captain'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer)
    left join public.game_lineups lineup on lineup.game_id = target_game_id and lineup.player_id = pick.player_id
    where lineup.id is null or lineup.role <> pick.role
  ) then raise exception 'Every fantasy pick must match a player and role in the saved lineup'; end if;

  select exists(select 1 from public.game_lineups where game_id = target_game_id and role = 'goalkeeper') into has_goalkeeper;
  if has_goalkeeper <> ((select count(*) from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer) where pick.role = 'goalkeeper') = 1) then
    raise exception 'Choose exactly one goalkeeper when a goalkeeper is available';
  end if;

  insert into public.fantasy_squads(user_id, game_id)
  values (current_user_id, target_game_id)
  on conflict (user_id, game_id) do update set updated_at = now()
  returning id into target_squad_id;

  delete from public.fantasy_picks where squad_id = target_squad_id;
  insert into public.fantasy_picks(squad_id, player_id, role, is_captain, slot_index)
  select target_squad_id, pick.player_id, pick.role, pick.is_captain, pick.slot_index
  from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer);
  return target_squad_id;
end;
$$;

create or replace function public.set_game_status(target_game_id uuid, new_status public.game_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_game public.games%rowtype;
  lineup_count integer;
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

  perform set_config('app.allow_final_transition', 'true', true);
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games
  set status = new_status,
      finalized_at = case when new_status = 'final' then now() else finalized_at end,
      correction_open = case when new_status = 'final' then false else correction_open end
  where id = target_game_id;
  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (auth.uid(), target_game_id, 'status_changed', to_jsonb(old_game), jsonb_build_object('status', new_status));
end;
$$;

create or replace function public.reopen_final_game(target_game_id uuid, correction_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_game public.games%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(correction_reason, ''))) < 3 then raise exception 'A correction reason is required'; end if;
  select * into old_game from public.games where id = target_game_id and status = 'final' for update;
  if not found then raise exception 'Only a final game can be reopened'; end if;
  perform set_config('app.allow_final_transition', 'true', true);
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games set status = 'live', correction_open = true where id = target_game_id;
  insert into public.admin_audit_log(admin_user_id, game_id, action, reason, before_data, after_data)
  values (auth.uid(), target_game_id, 'final_game_reopened', trim(correction_reason), to_jsonb(old_game), jsonb_build_object('status', 'live', 'correction_open', true));
end;
$$;

create or replace function public.archive_player(target_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare old_player public.players%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into old_player from public.players where id = target_player_id for update;
  if not found then raise exception 'Player not found'; end if;
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.players set active = false, archived_at = coalesce(archived_at, now()) where id = target_player_id;
  insert into public.admin_audit_log(admin_user_id, action, before_data, after_data)
  values (auth.uid(), 'player_archived', to_jsonb(old_player), jsonb_build_object('id', target_player_id, 'active', false));
end;
$$;

create or replace function public.restore_player(target_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare old_player public.players%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into old_player from public.players where id = target_player_id for update;
  if not found then raise exception 'Player not found'; end if;
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.players set active = true, archived_at = null where id = target_player_id;
  insert into public.admin_audit_log(admin_user_id, action, before_data, after_data)
  values (auth.uid(), 'player_restored', to_jsonb(old_player), jsonb_build_object('id', target_player_id, 'active', true));
end;
$$;

-- Direct fantasy writes and destructive player deletes are replaced by controlled functions.
drop policy if exists "users insert own fantasy squad" on public.fantasy_squads;
drop policy if exists "users update own fantasy squad" on public.fantasy_squads;
drop policy if exists "users delete own fantasy squad" on public.fantasy_squads;
drop policy if exists "users insert own fantasy picks" on public.fantasy_picks;
drop policy if exists "users update own fantasy picks" on public.fantasy_picks;
drop policy if exists "users delete own fantasy picks" on public.fantasy_picks;
drop policy if exists "admins delete players" on public.players;

revoke all on function public.save_game_lineup(uuid, jsonb) from public;
revoke all on function public.save_fantasy_squad(uuid, jsonb) from public;
revoke all on function public.set_game_status(uuid, public.game_status) from public;
revoke all on function public.reopen_final_game(uuid, text) from public;
revoke all on function public.archive_player(uuid) from public;
revoke all on function public.restore_player(uuid) from public;
grant execute on function public.save_game_lineup(uuid, jsonb) to authenticated;
grant execute on function public.save_fantasy_squad(uuid, jsonb) to authenticated;
grant execute on function public.set_game_status(uuid, public.game_status) to authenticated;
grant execute on function public.reopen_final_game(uuid, text) to authenticated;
grant execute on function public.archive_player(uuid) to authenticated;
grant execute on function public.restore_player(uuid) to authenticated;
