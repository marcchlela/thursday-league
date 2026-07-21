-- Reusable guest players remain valid match participants while being excluded
-- from league statistics, fantasy scoring/selection, individual betting markets,
-- and persistent player-level model history.

alter table public.players
  add column if not exists competition_eligible boolean not null default true;

create or replace function public.invalidate_betting_after_player_eligibility_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.competition_eligible is distinct from new.competition_eligible then
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
after update of competition_eligible on public.players
for each row execute function public.invalidate_betting_after_player_eligibility_change();

create or replace function public.admin_set_player_competition_eligibility(
  target_player_id uuid,
  new_eligibility boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_player public.players%rowtype;
  before_state jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if new_eligibility is null then raise exception 'Competition eligibility is required'; end if;

  select * into target_player from public.players where id = target_player_id for update;
  if not found then raise exception 'Player not found'; end if;
  if target_player.competition_eligible = new_eligibility then return; end if;

  before_state := to_jsonb(target_player);
  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.players set competition_eligible = new_eligibility where id = target_player_id;

  insert into public.admin_audit_log(admin_user_id, action, before_data, after_data)
  values (
    auth.uid(),
    'player_competition_eligibility_changed',
    before_state,
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
    where id = new.player_id and competition_eligible
  ) then
    raise exception 'Guest players cannot be selected for fantasy';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_fantasy_pick_competition_eligibility on public.fantasy_picks;
create trigger guard_fantasy_pick_competition_eligibility
before insert or update of player_id on public.fantasy_picks
for each row execute function public.guard_fantasy_pick_competition_eligibility();

create or replace function public.save_fantasy_squad(target_game_id uuid, submitted_picks jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
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
    left join public.players player on player.id = pick.player_id
    where lineup.id is null or lineup.role <> pick.role or player.competition_eligible is not true
  ) then raise exception 'Every fantasy pick must be an eligible player matching the saved lineup and role'; end if;

  select exists(
    select 1
    from public.game_lineups lineup
    join public.players player on player.id = lineup.player_id
    where lineup.game_id = target_game_id
      and lineup.role = 'goalkeeper'
      and player.competition_eligible
  ) into has_goalkeeper;
  if has_goalkeeper <> ((select count(*) from jsonb_to_recordset(submitted_picks) as pick(player_id uuid, role public.player_position, is_captain boolean, slot_index integer) where pick.role = 'goalkeeper') = 1) then
    raise exception 'Choose exactly one goalkeeper when an eligible goalkeeper is available';
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
       where id = new.subject_player_id and competition_eligible
     )
  then raise exception 'Individual betting markets cannot use guest players'; end if;
  return new;
end;
$$;

drop trigger if exists guard_betting_market_player_eligibility on public.betting_markets;
create trigger guard_betting_market_player_eligibility
before insert or update of market_type, subject_player_id on public.betting_markets
for each row execute function public.guard_betting_market_player_eligibility();

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
       where id = target_player_id and competition_eligible
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

revoke all on function public.admin_set_player_competition_eligibility(uuid, boolean) from public;
revoke all on function public.save_fantasy_squad(uuid, jsonb) from public;
revoke all on function public.evaluate_bet_leg(text, text, numeric, uuid, public.game_result_versions) from public;
revoke all on function public.invalidate_betting_after_player_eligibility_change() from public;
revoke all on function public.guard_fantasy_pick_competition_eligibility() from public;
revoke all on function public.guard_betting_market_player_eligibility() from public;
grant execute on function public.admin_set_player_competition_eligibility(uuid, boolean) to authenticated;
grant execute on function public.save_fantasy_squad(uuid, jsonb) to authenticated;
