-- Restore the lineup publication transition that was present in
-- save_game_lineup but was accidentally omitted from save_game_lineup_v2.

create or replace function public.save_game_lineup_v2(
  target_game_id uuid,
  submitted_lineup jsonb,
  team_a_mode text,
  team_b_mode text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  submitted_count integer;
  before_state jsonb;
  target_game public.games%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if team_a_mode not in ('fixed', 'rotating') or team_b_mode not in ('fixed', 'rotating') then
    raise exception 'Each team needs a valid goalkeeper mode';
  end if;
  if jsonb_typeof(submitted_lineup) <> 'array' then raise exception 'Lineup must be an array'; end if;

  select * into target_game from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if target_game.status = 'final' then raise exception 'Reopen the final game before changing its lineup'; end if;

  select count(*) into submitted_count
  from jsonb_to_recordset(submitted_lineup)
    as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer);
  if submitted_count <> 10 then raise exception 'A lineup must contain exactly 10 players'; end if;
  if (
    select count(distinct item.player_id)
    from jsonb_to_recordset(submitted_lineup)
      as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer)
  ) <> 10 then raise exception 'Every lineup player must be unique'; end if;

  if exists (
    select 1
    from (values ('A'::public.team_code, team_a_mode), ('B'::public.team_code, team_b_mode)) teams(team, mode)
    where (
      select count(*)
      from jsonb_to_recordset(submitted_lineup)
        as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer)
      where item.team = teams.team
    ) <> 5
    or (
      select count(distinct item.slot_index)
      from jsonb_to_recordset(submitted_lineup)
        as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer)
      where item.team = teams.team and item.slot_index between 0 and 4
    ) <> 5
    or (
      select count(*)
      from jsonb_to_recordset(submitted_lineup)
        as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer)
      where item.team = teams.team and item.role = 'goalkeeper'
    ) <> case when teams.mode = 'fixed' then 1 else 0 end
  ) then raise exception 'Fixed teams need 1 GK and 4 OUT; rotating teams need 5 OUT'; end if;

  if (
    select count(*)
    from public.players player
    join jsonb_to_recordset(submitted_lineup)
      as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer)
      on item.player_id = player.id
    where player.active and player.archived_at is null
  ) <> 10 then raise exception 'Lineups can only use active, non-archived players'; end if;

  select jsonb_build_object(
    'game', jsonb_build_object(
      'status', target_game.status,
      'team_a_goalkeeper_mode', target_game.team_a_goalkeeper_mode,
      'team_b_goalkeeper_mode', target_game.team_b_goalkeeper_mode
    ),
    'lineups', coalesce((
      select jsonb_agg(to_jsonb(lineup) order by lineup.team, lineup.slot_index)
      from public.game_lineups lineup
      where lineup.game_id = target_game_id
    ), '[]'::jsonb)
  ) into before_state;

  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games
  set team_a_goalkeeper_mode = team_a_mode,
      team_b_goalkeeper_mode = team_b_mode,
      status = case when status = 'upcoming' then 'draft' else status end
  where id = target_game_id;

  delete from public.game_lineups where game_id = target_game_id;
  insert into public.game_lineups(game_id, player_id, team, role, slot_index)
  select target_game_id, item.player_id, item.team, item.role, item.slot_index
  from jsonb_to_recordset(submitted_lineup)
    as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer);

  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (
    auth.uid(),
    target_game_id,
    'lineup_replaced',
    before_state,
    jsonb_build_object(
      'game', jsonb_build_object(
        'status', case when target_game.status = 'upcoming' then 'draft' else target_game.status end,
        'team_a_goalkeeper_mode', team_a_mode,
        'team_b_goalkeeper_mode', team_b_mode
      ),
      'lineups', submitted_lineup
    )
  );
end;
$$;

revoke all on function public.save_game_lineup_v2(uuid, jsonb, text, text) from public;
grant execute on function public.save_game_lineup_v2(uuid, jsonb, text, text) to authenticated;

-- Repair any future match that was already left in the inconsistent state:
-- a complete valid lineup saved while the game still says upcoming.
update public.games game
set status = 'draft'
where game.status = 'upcoming'
  and game.game_date > now()
  and not exists (
    select 1
    from (values
      ('A'::public.team_code, game.team_a_goalkeeper_mode),
      ('B'::public.team_code, game.team_b_goalkeeper_mode)
    ) teams(team, mode)
    where (
      select count(*)
      from public.game_lineups lineup
      where lineup.game_id = game.id and lineup.team = teams.team
    ) <> 5
       or (
         select count(*)
         from public.game_lineups lineup
         where lineup.game_id = game.id
           and lineup.team = teams.team
           and lineup.role = 'goalkeeper'
       ) <> case when teams.mode = 'fixed' then 1 else 0 end
  );
