-- Rotating goalkeeper lineups, transactional stat-grid entry, flexible fantasy,
-- guest statistics, and team-save betting markets.

alter table public.games
  add column if not exists team_a_goalkeeper_mode text not null default 'fixed',
  add column if not exists team_b_goalkeeper_mode text not null default 'fixed';

alter table public.games drop constraint if exists games_team_a_goalkeeper_mode_check;
alter table public.games add constraint games_team_a_goalkeeper_mode_check
  check (team_a_goalkeeper_mode in ('fixed', 'rotating'));
alter table public.games drop constraint if exists games_team_b_goalkeeper_mode_check;
alter table public.games add constraint games_team_b_goalkeeper_mode_check
  check (team_b_goalkeeper_mode in ('fixed', 'rotating'));

alter table public.game_player_stats
  add column if not exists own_goals integer not null default 0;
alter table public.game_player_stats drop constraint if exists game_player_stats_own_goals_check;
alter table public.game_player_stats add constraint game_player_stats_own_goals_check
  check (own_goals >= 0);

alter table public.betting_markets
  add column if not exists subject_team public.team_code;

-- Replace the original anonymous market-shape checks with named constraints
-- that understand team-save markets.
do $$
declare target_constraint record;
begin
  for target_constraint in
    select constraint_name
    from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name in (
        select con.conname
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace ns on ns.oid = rel.relnamespace
        where ns.nspname = 'public'
          and rel.relname = 'betting_markets'
          and con.contype = 'c'
          and pg_get_constraintdef(con.oid) like '%market_type%'
      )
  loop
    execute format('alter table public.betting_markets drop constraint %I', target_constraint.constraint_name);
  end loop;
end
$$;

alter table public.betting_markets drop constraint if exists betting_markets_type_check_v2;
alter table public.betting_markets add constraint betting_markets_type_check_v2 check (
  market_type in ('match_result', 'total_goals', 'player_goals', 'player_assists', 'goalkeeper_saves', 'team_saves', 'own_goal')
);
alter table public.betting_markets drop constraint if exists betting_markets_subject_check_v2;
alter table public.betting_markets add constraint betting_markets_subject_check_v2 check (
  (market_type in ('player_goals', 'player_assists', 'goalkeeper_saves') and subject_player_id is not null and subject_team is null)
  or (market_type = 'team_saves' and subject_player_id is null and subject_team is not null)
  or (market_type in ('match_result', 'total_goals', 'own_goal') and subject_player_id is null and subject_team is null)
);
alter table public.betting_markets drop constraint if exists betting_markets_line_check_v2;
alter table public.betting_markets add constraint betting_markets_line_check_v2 check (
  (market_type in ('total_goals', 'player_goals', 'player_assists', 'goalkeeper_saves', 'team_saves') and line is not null)
  or (market_type in ('match_result', 'own_goal') and line is null)
);

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
    'game', jsonb_build_object('team_a_goalkeeper_mode', target_game.team_a_goalkeeper_mode, 'team_b_goalkeeper_mode', target_game.team_b_goalkeeper_mode),
    'lineups', coalesce((select jsonb_agg(to_jsonb(lineup) order by lineup.team, lineup.slot_index) from public.game_lineups lineup where lineup.game_id = target_game_id), '[]'::jsonb)
  ) into before_state;

  perform set_config('app.suppress_generic_audit', 'true', true);
  update public.games
  set team_a_goalkeeper_mode = team_a_mode,
      team_b_goalkeeper_mode = team_b_mode
  where id = target_game_id;
  delete from public.game_lineups where game_id = target_game_id;
  insert into public.game_lineups(game_id, player_id, team, role, slot_index)
  select target_game_id, item.player_id, item.team, item.role, item.slot_index
  from jsonb_to_recordset(submitted_lineup)
    as item(player_id uuid, team public.team_code, role public.player_position, slot_index integer);

  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (
    auth.uid(), target_game_id, 'lineup_replaced', before_state,
    jsonb_build_object(
      'game', jsonb_build_object('team_a_goalkeeper_mode', team_a_mode, 'team_b_goalkeeper_mode', team_b_mode),
      'lineups', submitted_lineup
    )
  );
end;
$$;

create or replace function public.save_game_stat_grid(target_game_id uuid, submitted_stats jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_game public.games%rowtype;
  before_state jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if jsonb_typeof(submitted_stats) <> 'array' then raise exception 'Statistics must be an array'; end if;
  select * into target_game from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if target_game.status = 'final' then raise exception 'Reopen the final game before correcting statistics'; end if;

  if (select count(*) from public.game_lineups where game_id = target_game_id) <> 10
     or (select count(*) from jsonb_to_recordset(submitted_stats) as stat(
       player_id uuid, team public.team_code, role public.player_position,
       goals integer, assists integer, saves integer, own_goals integer
     )) <> 10
     or (select count(distinct stat.player_id) from jsonb_to_recordset(submitted_stats) as stat(
       player_id uuid, team public.team_code, role public.player_position,
       goals integer, assists integer, saves integer, own_goals integer
     )) <> 10
  then raise exception 'Save exactly one statistics row for every lineup player'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(submitted_stats) as stat(
      player_id uuid, team public.team_code, role public.player_position,
      goals integer, assists integer, saves integer, own_goals integer
    )
    left join public.game_lineups lineup
      on lineup.game_id = target_game_id
     and lineup.player_id = stat.player_id
     and lineup.team = stat.team
     and lineup.role = stat.role
    where lineup.id is null
       or stat.goals is null or stat.goals < 0
       or stat.assists is null or stat.assists < 0
       or stat.saves is null or stat.saves < 0
       or stat.own_goals is null or stat.own_goals < 0
  ) then raise exception 'Statistics must match the saved lineup and use whole values of zero or more'; end if;

  select jsonb_build_object(
    'events', coalesce((select jsonb_agg(to_jsonb(event)) from public.events event where event.game_id = target_game_id), '[]'::jsonb),
    'player_stats', coalesce((select jsonb_agg(to_jsonb(stat)) from public.game_player_stats stat where stat.game_id = target_game_id), '[]'::jsonb)
  ) into before_state;

  perform set_config('app.suppress_generic_audit', 'true', true);
  delete from public.events where game_id = target_game_id;
  delete from public.game_player_stats where game_id = target_game_id;
  insert into public.game_player_stats(game_id, player_id, team, role, goals, assists, saves, own_goals)
  select target_game_id, stat.player_id, stat.team, stat.role, stat.goals, stat.assists, stat.saves, stat.own_goals
  from jsonb_to_recordset(submitted_stats) as stat(
    player_id uuid, team public.team_code, role public.player_position,
    goals integer, assists integer, saves integer, own_goals integer
  );

  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (auth.uid(), target_game_id, 'match_stat_grid_saved', before_state, submitted_stats);
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
    where lineup.id is null or lineup.role <> pick.role or player.competition_eligible is not true
  ) then raise exception 'Every fantasy pick must be an eligible player matching the saved lineup role'; end if;

  select count(*) into eligible_goalkeeper_count
  from public.game_lineups lineup
  join public.players player on player.id = lineup.player_id
  where lineup.game_id = target_game_id
    and lineup.role = 'goalkeeper'
    and player.competition_eligible;

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

create or replace function public.create_game_result_version(target_game_id uuid, target_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_version_id uuid;
  next_version integer;
  score_a_value integer;
  score_b_value integer;
  own_goals_value integer;
  player_totals_value jsonb;
  event_count_value integer;
  stat_count_value integer;
begin
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.game_result_versions where game_id = target_game_id;

  select
    coalesce(sum(case when event.event_type = 'goal' and lineup.team = 'A' then 1 when event.event_type = 'own_goal' and lineup.team = 'B' then 1 else 0 end), 0),
    coalesce(sum(case when event.event_type = 'goal' and lineup.team = 'B' then 1 when event.event_type = 'own_goal' and lineup.team = 'A' then 1 else 0 end), 0),
    coalesce(sum(case when event.event_type = 'own_goal' then 1 else 0 end), 0),
    count(event.id)
  into score_a_value, score_b_value, own_goals_value, event_count_value
  from public.events event
  left join public.game_lineups lineup on lineup.game_id = event.game_id and lineup.player_id = event.player_id
  where event.game_id = target_game_id;

  select
    score_a_value + coalesce(sum(case when stat.team = 'A' then stat.goals else stat.own_goals end), 0),
    score_b_value + coalesce(sum(case when stat.team = 'B' then stat.goals else stat.own_goals end), 0),
    own_goals_value + coalesce(sum(stat.own_goals), 0),
    count(stat.id)
  into score_a_value, score_b_value, own_goals_value, stat_count_value
  from public.game_player_stats stat where stat.game_id = target_game_id;

  select coalesce(jsonb_object_agg(player_result.player_id::text, jsonb_build_object(
    'team', player_result.team, 'role', player_result.role, 'goals', player_result.goals,
    'assists', player_result.assists, 'saves', player_result.saves, 'own_goals', player_result.own_goals
  )), '{}'::jsonb)
  into player_totals_value
  from (
    select lineup.player_id, lineup.team, lineup.role,
      coalesce((select count(*) from public.events event where event.game_id = target_game_id and event.event_type = 'goal' and event.player_id = lineup.player_id), 0) + coalesce(stat.goals, 0) as goals,
      coalesce((select count(*) from public.events event where event.game_id = target_game_id and event.event_type = 'goal' and event.assist_player_id = lineup.player_id), 0) + coalesce(stat.assists, 0) as assists,
      coalesce(stat.saves, 0) as saves,
      coalesce((select count(*) from public.events event where event.game_id = target_game_id and event.event_type = 'own_goal' and event.player_id = lineup.player_id), 0) + coalesce(stat.own_goals, 0) as own_goals
    from public.game_lineups lineup
    left join public.game_player_stats stat on stat.game_id = lineup.game_id and stat.player_id = lineup.player_id
    where lineup.game_id = target_game_id
  ) player_result;

  insert into public.game_result_versions(
    game_id, version_number, score_a, score_b, own_goal_count, player_totals,
    source_summary, correction_reason, created_by
  ) values (
    target_game_id, next_version, score_a_value, score_b_value, own_goals_value, player_totals_value,
    jsonb_build_object('events', event_count_value, 'stat_grid_rows', stat_count_value, 'aggregation', 'events_plus_stat_grid'),
    target_reason, auth.uid()
  ) returning id into created_version_id;
  return created_version_id;
end;
$$;

create or replace function public.admin_generate_betting_markets(
  target_game_id uuid,
  target_model_version text,
  target_input_snapshot jsonb,
  submitted_markets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_game public.games%rowtype;
  generated_run_id uuid;
  generated_market_id uuid;
  market_item jsonb;
  outcome_item jsonb;
  lock_minutes_value integer;
  outcome_count integer;
  probability_total numeric;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(target_model_version, ''))) < 1 then raise exception 'Model version is required'; end if;
  if coalesce(jsonb_typeof(submitted_markets), 'null') <> 'array' or jsonb_array_length(submitted_markets) = 0 then
    raise exception 'At least one market is required';
  end if;
  select * into target_game from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  select lock_minutes into lock_minutes_value from public.betting_settings where id = 1;
  if target_game.status not in ('upcoming', 'draft') or now() >= target_game.game_date - make_interval(mins => lock_minutes_value) then
    raise exception 'Odds can only be generated before betting locks';
  end if;
  if (select count(*) from public.game_lineups where game_id = target_game_id) <> 10 then
    raise exception 'Save both five-player lineups before generating odds';
  end if;
  if exists (select 1 from public.bet_slips where game_id = target_game_id) then
    raise exception 'Markets with accepted bets cannot be regenerated; suspend them instead';
  end if;

  delete from public.betting_markets where game_id = target_game_id;
  insert into public.odds_generation_runs(game_id, model_version, input_snapshot, generated_by)
  values (target_game_id, trim(target_model_version), coalesce(target_input_snapshot, '{}'::jsonb), auth.uid())
  returning id into generated_run_id;

  for market_item in select value from jsonb_array_elements(submitted_markets) loop
    if coalesce(market_item ->> 'market_type', '') not in ('match_result', 'total_goals', 'player_goals', 'player_assists', 'goalkeeper_saves', 'team_saves', 'own_goal') then
      raise exception 'Unsupported market type';
    end if;
    if length(trim(coalesce(market_item ->> 'market_key', ''))) < 1 or length(trim(coalesce(market_item ->> 'title', ''))) < 1 then
      raise exception 'Every market needs a key and title';
    end if;
    if coalesce(jsonb_typeof(market_item -> 'outcomes'), 'null') <> 'array' or jsonb_array_length(market_item -> 'outcomes') < 2 then
      raise exception 'Every market needs at least two outcomes';
    end if;
    if coalesce(market_item ->> 'market_type', '') in ('player_goals', 'player_assists', 'goalkeeper_saves')
       and not exists (
         select 1 from public.game_lineups lineup
         join public.players player on player.id = lineup.player_id
         where lineup.game_id = target_game_id
           and lineup.player_id = nullif(market_item ->> 'subject_player_id', '')::uuid
           and player.competition_eligible
           and (coalesce(market_item ->> 'market_type', '') <> 'goalkeeper_saves' or lineup.role = 'goalkeeper')
       )
    then raise exception 'Individual markets must use eligible players in the confirmed lineup'; end if;
    if coalesce(market_item ->> 'market_type', '') = 'team_saves'
       and coalesce(market_item ->> 'subject_team', '') not in ('A', 'B')
    then raise exception 'Team-save markets need Team A or Team B'; end if;

    insert into public.betting_markets(
      game_id, generation_run_id, market_key, market_type, title, subject_player_id, subject_team, line
    ) values (
      target_game_id, generated_run_id, market_item ->> 'market_key', market_item ->> 'market_type',
      market_item ->> 'title', nullif(market_item ->> 'subject_player_id', '')::uuid,
      nullif(market_item ->> 'subject_team', '')::public.team_code,
      nullif(market_item ->> 'line', '')::numeric
    ) returning id into generated_market_id;

    outcome_count := 0;
    for outcome_item in select value from jsonb_array_elements(market_item -> 'outcomes') loop
      if length(trim(coalesce(outcome_item ->> 'outcome_key', ''))) < 1
         or length(trim(coalesce(outcome_item ->> 'label', ''))) < 1
         or (outcome_item ->> 'fair_probability')::numeric <= 0
         or (outcome_item ->> 'fair_probability')::numeric >= 1
         or (outcome_item ->> 'offered_odds')::numeric < 1.01
      then raise exception 'Probabilities or odds are outside the allowed range'; end if;
      if ((market_item ->> 'market_type') = 'match_result' and (outcome_item ->> 'outcome_key') not in ('A', 'draw', 'B'))
         or ((market_item ->> 'market_type') in ('total_goals', 'player_goals', 'player_assists', 'goalkeeper_saves', 'team_saves') and (outcome_item ->> 'outcome_key') not in ('over', 'under'))
         or ((market_item ->> 'market_type') = 'own_goal' and (outcome_item ->> 'outcome_key') not in ('yes', 'no'))
      then raise exception 'Outcome key does not match its market type'; end if;
      insert into public.betting_outcomes(market_id, outcome_key, label, fair_probability, offered_odds)
      values (
        generated_market_id, outcome_item ->> 'outcome_key', outcome_item ->> 'label',
        (outcome_item ->> 'fair_probability')::numeric, (outcome_item ->> 'offered_odds')::numeric
      );
      outcome_count := outcome_count + 1;
    end loop;
    select sum(fair_probability) into probability_total from public.betting_outcomes where market_id = generated_market_id;
    if outcome_count < 2 or abs(probability_total - 1) > 0.02 then
      raise exception 'Fair probabilities for each market must total approximately 100%%';
    end if;
  end loop;

  insert into public.admin_audit_log(admin_user_id, game_id, action, after_data)
  values (auth.uid(), target_game_id, 'betting_odds_generated', jsonb_build_object('generation_run_id', generated_run_id, 'market_count', jsonb_array_length(submitted_markets), 'model_version', target_model_version));
  return generated_run_id;
end;
$$;

create or replace function public.settle_game_bets(target_game_id uuid, target_result_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_result public.game_result_versions%rowtype;
  target_slip public.bet_slips%rowtype;
  target_leg record;
  target_wallet public.betting_wallets%rowtype;
  leg_status text;
  final_slip_status text;
  won_count integer;
  lost_count integer;
  void_count integer;
  processed_count integer := 0;
  slips_won_count integer := 0;
  slips_lost_count integer := 0;
  slips_void_count integer := 0;
  active_product_odds numeric;
  final_odds numeric;
  new_payout bigint;
  payout_delta bigint;
  total_adjustment bigint := 0;
  builder_margin_value numeric;
  actual_value numeric;
begin
  select * into target_result from public.game_result_versions where id = target_result_version_id and game_id = target_game_id;
  if not found then raise exception 'Result version not found'; end if;
  select builder_margin into builder_margin_value from public.betting_settings where id = 1;

  for target_slip in
    select * from public.bet_slips where game_id = target_game_id and status <> 'cashed_out'
    order by placed_at for update
  loop
    won_count := 0; lost_count := 0; void_count := 0; active_product_odds := 1;
    for target_leg in
      select leg.*, market.market_type, market.line, market.subject_player_id, market.subject_team, outcome.outcome_key
      from public.bet_legs leg
      join public.betting_markets market on market.id = leg.market_id
      join public.betting_outcomes outcome on outcome.id = leg.outcome_id
      where leg.slip_id = target_slip.id
      order by leg.created_at
    loop
      if target_leg.market_type = 'team_saves' then
        select coalesce(sum((entry.value ->> 'saves')::numeric), 0) into actual_value
        from jsonb_each(target_result.player_totals) entry
        where entry.value ->> 'team' = target_leg.subject_team::text;
        leg_status := case
          when actual_value = target_leg.line then 'void'
          when target_leg.outcome_key = 'over' and actual_value > target_leg.line then 'won'
          when target_leg.outcome_key = 'under' and actual_value < target_leg.line then 'won'
          else 'lost'
        end;
      else
        leg_status := public.evaluate_bet_leg(target_leg.market_type, target_leg.outcome_key, target_leg.line, target_leg.subject_player_id, target_result);
        actual_value := case
          when target_leg.market_type = 'total_goals' then target_result.score_a + target_result.score_b
          when target_leg.market_type = 'own_goal' then target_result.own_goal_count
          when target_leg.market_type = 'player_goals' then (target_result.player_totals -> target_leg.subject_player_id::text ->> 'goals')::numeric
          when target_leg.market_type = 'player_assists' then (target_result.player_totals -> target_leg.subject_player_id::text ->> 'assists')::numeric
          when target_leg.market_type = 'goalkeeper_saves' then (target_result.player_totals -> target_leg.subject_player_id::text ->> 'saves')::numeric
          else null
        end;
      end if;
      update public.bet_legs set status = leg_status, result_value = actual_value where id = target_leg.id;
      if leg_status = 'won' then won_count := won_count + 1; active_product_odds := active_product_odds * target_leg.accepted_odds;
      elsif leg_status = 'lost' then lost_count := lost_count + 1;
      else void_count := void_count + 1; end if;
    end loop;

    if lost_count > 0 then final_slip_status := 'lost'; new_payout := 0;
    elsif won_count = 0 then final_slip_status := 'void'; new_payout := target_slip.stake_units;
    else
      final_slip_status := 'won';
      final_odds := case
        when target_slip.slip_type = 'single' or void_count = 0 then target_slip.accepted_odds
        else greatest(1.01, 1 + (active_product_odds - 1) * (1 - builder_margin_value)) end;
      new_payout := round(target_slip.stake_units * final_odds)::bigint;
    end if;

    payout_delta := new_payout - coalesce(target_slip.settled_payout_units, 0);
    if payout_delta <> 0 then
      select * into target_wallet from public.betting_wallets where id = target_slip.wallet_id for update;
      update public.betting_wallets set balance_units = balance_units + payout_delta, updated_at = now()
      where id = target_wallet.id returning balance_units into target_wallet.balance_units;
      insert into public.coin_ledger(wallet_id, slip_id, entry_type, amount_units, balance_after_units, idempotency_key, metadata)
      values (
        target_wallet.id, target_slip.id,
        case when target_slip.settled_payout_units is null then 'payout' else 'settlement_correction' end,
        payout_delta, target_wallet.balance_units,
        'settlement:' || target_slip.id::text || ':' || target_result_version_id::text,
        jsonb_build_object('result_version_id', target_result_version_id, 'previous_payout_units', target_slip.settled_payout_units, 'new_payout_units', new_payout)
      );
    end if;

    update public.bet_slips
    set status = final_slip_status, settled_payout_units = new_payout, settled_at = now(), result_version_id = target_result_version_id
    where id = target_slip.id;
    processed_count := processed_count + 1;
    if final_slip_status = 'won' then slips_won_count := slips_won_count + 1;
    elsif final_slip_status = 'lost' then slips_lost_count := slips_lost_count + 1;
    else slips_void_count := slips_void_count + 1; end if;
    total_adjustment := total_adjustment + payout_delta;
  end loop;

  update public.betting_markets set status = 'settled', updated_at = now()
  where game_id = target_game_id and status <> 'void';
  insert into public.bet_settlement_runs(game_id, result_version_id, settled_by, slips_processed, slips_won, slips_lost, slips_void, total_adjustment_units)
  values (target_game_id, target_result_version_id, auth.uid(), processed_count, slips_won_count, slips_lost_count, slips_void_count, total_adjustment);
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
  created_result_version_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into old_game from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if old_game.status = 'final' then
    if new_status <> 'final' then raise exception 'Use reopen_final_game for controlled corrections'; end if;
    raise exception 'Game is already final';
  end if;

  if new_status in ('live', 'final') then
    select count(*) into lineup_count from public.game_lineups where game_id = target_game_id and slot_index is not null;
    if lineup_count <> 10 or exists (
      select 1
      from (values
        ('A'::public.team_code, old_game.team_a_goalkeeper_mode),
        ('B'::public.team_code, old_game.team_b_goalkeeper_mode)
      ) teams(team, mode)
      where (select count(*) from public.game_lineups where game_id = target_game_id and team = teams.team) <> 5
         or (select count(*) from public.game_lineups where game_id = target_game_id and team = teams.team and role = 'goalkeeper') <> case when teams.mode = 'fixed' then 1 else 0 end
    ) then raise exception 'Save valid five-player lineups for both goalkeeper modes first'; end if;
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

  if new_status = 'live' then
    update public.betting_markets set status = 'locked', updated_at = now()
    where game_id = target_game_id and status = 'open';
  end if;
  if new_status = 'final' then
    created_result_version_id := public.create_game_result_version(target_game_id, status_reason);
    perform public.settle_game_bets(target_game_id, created_result_version_id);
  end if;

  insert into public.admin_audit_log(admin_user_id, game_id, action, reason, before_data, after_data)
  values (
    auth.uid(), target_game_id, 'status_changed', status_reason, to_jsonb(old_game),
    jsonb_build_object('status', new_status, 'correction_completed', old_game.correction_open and new_status = 'final', 'result_version_id', created_result_version_id)
  );
end;
$$;

revoke all on function public.save_game_lineup_v2(uuid, jsonb, text, text) from public;
revoke all on function public.save_game_stat_grid(uuid, jsonb) from public;
revoke all on function public.save_fantasy_squad(uuid, jsonb) from public;
grant execute on function public.save_game_lineup_v2(uuid, jsonb, text, text) to authenticated;
grant execute on function public.save_game_stat_grid(uuid, jsonb) to authenticated;
grant execute on function public.save_fantasy_squad(uuid, jsonb) to authenticated;
