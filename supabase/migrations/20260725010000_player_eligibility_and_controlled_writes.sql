-- Split the old combined eligibility flag into clear product concepts and
-- make lineup/result history writable only through controlled functions.

alter table public.players
  add column if not exists player_type text not null default 'regular',
  add column if not exists fantasy_eligible boolean not null default true,
  add column if not exists individual_betting_eligible boolean not null default true;

alter table public.players drop constraint if exists players_player_type_check;
alter table public.players add constraint players_player_type_check
  check (player_type in ('regular', 'guest'));

update public.players
set player_type = case when competition_eligible then 'regular' else 'guest' end,
    fantasy_eligible = competition_eligible,
    individual_betting_eligible = competition_eligible
where player_type = 'regular'
  and fantasy_eligible
  and individual_betting_eligible;

-- Keep old deployed app versions usable during rollout. The compatibility
-- value means "eligible for at least one competition feature"; new code uses
-- the two explicit columns.
create or replace function public.sync_player_eligibility_compatibility()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.competition_eligible is false
       and new.fantasy_eligible
       and new.individual_betting_eligible
    then
      new.player_type := 'guest';
      new.fantasy_eligible := false;
      new.individual_betting_eligible := false;
    end if;
  elsif new.competition_eligible is distinct from old.competition_eligible
     and new.player_type is not distinct from old.player_type
     and new.fantasy_eligible is not distinct from old.fantasy_eligible
     and new.individual_betting_eligible is not distinct from old.individual_betting_eligible
  then
    new.player_type := case when new.competition_eligible then 'regular' else 'guest' end;
    new.fantasy_eligible := new.competition_eligible;
    new.individual_betting_eligible := new.competition_eligible;
  end if;

  new.competition_eligible := new.fantasy_eligible or new.individual_betting_eligible;
  return new;
end;
$$;

drop trigger if exists sync_player_eligibility_compatibility on public.players;
create trigger sync_player_eligibility_compatibility
before insert or update of competition_eligible, player_type, fantasy_eligible, individual_betting_eligible
on public.players
for each row execute function public.sync_player_eligibility_compatibility();

create or replace function public.invalidate_betting_after_player_eligibility_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.individual_betting_eligible is distinct from new.individual_betting_eligible then
    update public.betting_markets market
    set status = 'suspended', invalidated = true, updated_at = now()
    where market.game_id in (
      select lineup.game_id
      from public.game_lineups lineup
      join public.games game on game.id = lineup.game_id
      where lineup.player_id = new.id
        and game.status in ('upcoming', 'draft')
    )
      and market.status in ('draft', 'open', 'suspended');
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_betting_after_player_eligibility_change on public.players;
create trigger invalidate_betting_after_player_eligibility_change
after update of competition_eligible, individual_betting_eligible on public.players
for each row execute function public.invalidate_betting_after_player_eligibility_change();

create or replace function public.admin_update_player_settings(
  target_player_id uuid,
  new_name text,
  new_position public.player_position,
  new_active boolean,
  new_player_type text,
  new_fantasy_eligibility boolean,
  new_betting_eligibility boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_player public.players%rowtype;
  clean_name text := trim(coalesce(new_name, ''));
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(clean_name) < 1 then raise exception 'Player name is required'; end if;
  if new_player_type not in ('regular', 'guest') then raise exception 'Player type must be regular or guest'; end if;
  if new_active is null or new_fantasy_eligibility is null or new_betting_eligibility is null then
    raise exception 'Player settings cannot be null';
  end if;

  select * into target_player from public.players where id = target_player_id for update;
  if not found then raise exception 'Player not found'; end if;

  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.players
  set name = clean_name,
      default_position = new_position,
      active = new_active,
      player_type = new_player_type,
      fantasy_eligible = new_fantasy_eligibility,
      individual_betting_eligible = new_betting_eligibility
  where id = target_player_id;

  insert into public.admin_audit_log(admin_user_id, action, before_data, after_data)
  values (
    auth.uid(), 'player_settings_updated', to_jsonb(target_player),
    (select to_jsonb(player) from public.players player where player.id = target_player_id)
  );
end;
$$;

create or replace function public.guard_fantasy_pick_competition_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.players
    where id = new.player_id and fantasy_eligible
  ) then raise exception 'This player is not eligible for Fantasy'; end if;
  return new;
end;
$$;

create or replace function public.guard_betting_market_player_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.market_type in ('player_goals', 'player_assists', 'goalkeeper_saves')
     and not exists (
       select 1 from public.players
       where id = new.subject_player_id and individual_betting_eligible
     )
  then raise exception 'This player is not eligible for individual betting markets'; end if;
  return new;
end;
$$;

create or replace function public.save_fantasy_squad(target_game_id uuid, submitted_picks jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_squad_id uuid;
  eligible_goalkeeper_count integer;
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
    left join public.players player on player.id = pick.player_id
    where lineup.id is null or lineup.role <> pick.role or player.fantasy_eligible is not true
  ) then raise exception 'Every Fantasy pick must be an eligible player matching the saved lineup role'; end if;

  select count(*) into eligible_goalkeeper_count
  from public.game_lineups lineup
  join public.players player on player.id = lineup.player_id
  where lineup.game_id = target_game_id
    and lineup.role = 'goalkeeper'
    and player.fantasy_eligible;

  if eligible_goalkeeper_count >= 2
     and (select count(*) from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer) where pick.role = 'goalkeeper') <> 1
  then raise exception 'Choose exactly one goalkeeper when both teams provide an eligible fixed goalkeeper'; end if;

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

create or replace function public.evaluate_bet_leg(
  target_market_type text,
  target_outcome_key text,
  target_line numeric,
  target_player_id uuid,
  target_result public.game_result_versions
)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare actual_value numeric; actual_key text; player_result jsonb;
begin
  if target_market_type in ('player_goals', 'player_assists', 'goalkeeper_saves')
     and not exists (
       select 1 from public.players
       where id = target_player_id and individual_betting_eligible
     )
  then return 'void'; end if;

  if target_market_type = 'match_result' then
    actual_key := case when target_result.score_a > target_result.score_b then 'A' when target_result.score_b > target_result.score_a then 'B' else 'draw' end;
    return case when target_outcome_key = actual_key then 'won' else 'lost' end;
  elsif target_market_type = 'total_goals' then
    actual_value := target_result.score_a + target_result.score_b;
  elsif target_market_type = 'own_goal' then
    actual_key := case when target_result.own_goal_count > 0 then 'yes' else 'no' end;
    return case when target_outcome_key = actual_key then 'won' else 'lost' end;
  else
    player_result := target_result.player_totals -> target_player_id::text;
    if player_result is null then return 'void'; end if;
    if target_market_type = 'goalkeeper_saves' and coalesce(player_result ->> 'role', '') <> 'goalkeeper' then return 'void'; end if;
    actual_value := case target_market_type
      when 'player_goals' then (player_result ->> 'goals')::numeric
      when 'player_assists' then (player_result ->> 'assists')::numeric
      when 'goalkeeper_saves' then (player_result ->> 'saves')::numeric
      else null end;
  end if;
  if actual_value is null then return 'void'; end if;
  if actual_value = target_line then return 'void'; end if;
  if target_outcome_key = 'over' then return case when actual_value > target_line then 'won' else 'lost' end; end if;
  if target_outcome_key = 'under' then return case when actual_value < target_line then 'won' else 'lost' end; end if;
  return 'void';
end;
$$;

-- Controlled write boundary. Authenticated clients retain read access, while
-- security-definer functions perform all mutations.
drop policy if exists "admins insert lineups" on public.game_lineups;
drop policy if exists "admins update lineups" on public.game_lineups;
drop policy if exists "admins delete lineups" on public.game_lineups;
drop policy if exists "admins insert events" on public.events;
drop policy if exists "admins update events" on public.events;
drop policy if exists "admins delete events" on public.events;
drop policy if exists "admins insert game player stats" on public.game_player_stats;
drop policy if exists "admins update game player stats" on public.game_player_stats;
drop policy if exists "admins delete game player stats" on public.game_player_stats;
drop policy if exists "users insert own fantasy squad" on public.fantasy_squads;
drop policy if exists "users update own fantasy squad" on public.fantasy_squads;
drop policy if exists "users delete own fantasy squad" on public.fantasy_squads;
drop policy if exists "users insert own fantasy picks" on public.fantasy_picks;
drop policy if exists "users update own fantasy picks" on public.fantasy_picks;
drop policy if exists "users delete own fantasy picks" on public.fantasy_picks;
drop policy if exists "admins update players" on public.players;
drop policy if exists "admins delete players" on public.players;

revoke insert, update, delete on public.game_lineups from authenticated;
revoke insert, update, delete on public.events from authenticated;
revoke insert, update, delete on public.game_player_stats from authenticated;
revoke insert, update, delete on public.fantasy_squads from authenticated;
revoke insert, update, delete on public.fantasy_picks from authenticated;
revoke update, delete on public.players from authenticated;

revoke all on function public.admin_update_player_settings(uuid, text, public.player_position, boolean, text, boolean, boolean) from public;
grant execute on function public.admin_update_player_settings(uuid, text, public.player_position, boolean, text, boolean, boolean) to authenticated;
