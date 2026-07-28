-- Allow an administrator to append a newly eligible lineup player's missing
-- personal markets without replacing published prices or accepted bets.

create or replace function public.invalidate_betting_after_player_eligibility_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_game_id uuid;
  invalidation_reason text := case
    when new.individual_betting_eligible then 'player_betting_enabled'
    else 'player_betting_disabled'
  end;
begin
  if old.individual_betting_eligible is distinct from new.individual_betting_eligible then
    for affected_game_id in
      select distinct lineup.game_id
      from public.game_lineups lineup
      join public.games game on game.id = lineup.game_id
      where lineup.player_id = new.id
        and game.status in ('upcoming', 'draft')
    loop
      update public.betting_markets
      set status = 'suspended', invalidated = true, updated_at = now()
      where game_id = affected_game_id
        and status in ('draft', 'open', 'suspended');

      if found then
        insert into public.admin_audit_log(admin_user_id, game_id, action, after_data)
        values (
          auth.uid(),
          affected_game_id,
          'betting_auto_suspended',
          jsonb_build_object(
            'reason', invalidation_reason,
            'player_id', new.id,
            'previous_eligibility', old.individual_betting_eligible,
            'new_eligibility', new.individual_betting_eligible
          )
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.admin_repair_missing_player_markets(
  target_game_id uuid,
  target_player_id uuid,
  target_model_version text,
  target_input_snapshot jsonb,
  submitted_markets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_game public.games%rowtype;
  base_snapshot jsonb;
  base_generated_at timestamptz;
  generated_run_id uuid;
  generated_market_id uuid;
  market_item jsonb;
  outcome_item jsonb;
  market_type_value text;
  market_key_value text;
  lock_minutes_value integer;
  snapshot_lineup_count integer;
  matched_lineup_count integer;
  outcome_count integer;
  probability_total numeric;
  added_count integer := 0;
  added_keys jsonb := '[]'::jsonb;
  before_data jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(target_model_version, ''))) < 1 then raise exception 'Model version is required'; end if;
  if coalesce(jsonb_typeof(submitted_markets), 'null') <> 'array'
     or jsonb_array_length(submitted_markets) = 0
  then raise exception 'Generated markets are required'; end if;

  select * into target_game
  from public.games selected_game
  where selected_game.id = target_game_id
  for update;
  if not found then raise exception 'Game not found'; end if;

  select lock_minutes into lock_minutes_value
  from public.betting_settings
  where id = 1;
  if target_game.status not in ('upcoming', 'draft')
     or now() >= target_game.game_date - make_interval(mins => lock_minutes_value)
  then raise exception 'Missing markets can only be repaired before betting locks'; end if;

  if (
    select count(*)
    from public.game_lineups current_lineup
    where current_lineup.game_id = target_game_id
  ) <> 10 then
    raise exception 'The saved lineup is incomplete';
  end if;
  if not exists (
    select 1
    from public.game_lineups lineup
    join public.players player on player.id = lineup.player_id
    where lineup.game_id = target_game_id
      and lineup.player_id = target_player_id
      and player.individual_betting_eligible
  ) then raise exception 'The selected player is not an eligible member of this lineup'; end if;

  if not exists (
    select 1
    from public.betting_markets existing_market
    where existing_market.game_id = target_game_id
  ) then raise exception 'There are no existing markets to repair'; end if;
  if exists (
    select 1
    from public.betting_markets existing_market
    where existing_market.game_id = target_game_id
      and existing_market.status <> 'suspended'
  ) then raise exception 'Suspend the complete market set before repairing it'; end if;
  if exists (
    select 1
    from public.betting_markets market
    left join public.game_lineups lineup
      on lineup.game_id = market.game_id
     and lineup.player_id = market.subject_player_id
    left join public.players player on player.id = market.subject_player_id
    where market.game_id = target_game_id
      and market.subject_player_id is not null
      and (
        lineup.id is null
        or player.individual_betting_eligible is not true
        or (market.market_type = 'goalkeeper_saves' and lineup.role <> 'goalkeeper')
      )
  ) then raise exception 'An existing player market no longer matches the current eligible lineup'; end if;

  select run.input_snapshot, run.created_at
  into base_snapshot, base_generated_at
  from public.betting_markets market
  join public.odds_generation_runs run on run.id = market.generation_run_id
  where market.game_id = target_game_id
  order by market.created_at, run.created_at
  limit 1;

  with snapshot_lineup as (
    select
      'A'::public.team_code as team,
      (item ->> 'player_id')::uuid as player_id,
      (item ->> 'role')::public.player_position as role,
      item ->> 'player_type' as player_type,
      (item ->> 'model_eligible')::boolean as model_eligible
    from jsonb_array_elements(coalesce(base_snapshot -> 'team_A', '[]'::jsonb)) item
    union all
    select
      'B'::public.team_code,
      (item ->> 'player_id')::uuid,
      (item ->> 'role')::public.player_position,
      item ->> 'player_type',
      (item ->> 'model_eligible')::boolean
    from jsonb_array_elements(coalesce(base_snapshot -> 'team_B', '[]'::jsonb)) item
  )
  select
    count(*),
    count(current_player.id)
  into snapshot_lineup_count, matched_lineup_count
  from snapshot_lineup snapshot_entry
  left join public.game_lineups lineup
    on lineup.game_id = target_game_id
   and lineup.player_id = snapshot_entry.player_id
   and lineup.team = snapshot_entry.team
   and lineup.role = snapshot_entry.role
  left join public.players current_player
    on current_player.id = lineup.player_id
   and current_player.player_type = snapshot_entry.player_type
   and (current_player.player_type <> 'guest') = snapshot_entry.model_eligible;

  if snapshot_lineup_count <> 10 or matched_lineup_count <> 10 then
    raise exception 'The lineup or prediction eligibility differs from the one used for the existing odds';
  end if;
  if exists (
    select 1
    from public.admin_audit_log audit
    where audit.game_id = target_game_id
      and audit.action = 'betting_auto_suspended'
      and audit.created_at > base_generated_at
      and audit.after_data ->> 'reason' in ('lineup_changed', 'kickoff_changed')
  ) then raise exception 'A lineup or kick-off change requires a different correction'; end if;

  select jsonb_build_object(
    'market_count', count(*),
    'accepted_slip_count', (
      select count(*)
      from public.bet_slips slip
      where slip.game_id = target_game_id
    ),
    'generation_run_ids', jsonb_agg(distinct existing_market.generation_run_id)
  )
  into before_data
  from public.betting_markets existing_market
  where existing_market.game_id = target_game_id;

  insert into public.odds_generation_runs(game_id, model_version, input_snapshot, generated_by)
  values (
    target_game_id,
    trim(target_model_version) || '+eligibility-repair',
    coalesce(target_input_snapshot, '{}'::jsonb) || jsonb_build_object(
      'repair_type', 'missing_player_markets',
      'repair_player_id', target_player_id
    ),
    auth.uid()
  )
  returning id into generated_run_id;

  for market_item in select value from jsonb_array_elements(submitted_markets)
  loop
    market_type_value := coalesce(market_item ->> 'market_type', '');
    market_key_value := trim(coalesce(market_item ->> 'market_key', ''));

    if market_type_value not in ('player_goals', 'player_assists', 'goalkeeper_saves')
       or nullif(market_item ->> 'subject_player_id', '')::uuid is distinct from target_player_id
    then continue; end if;

    -- A repair adds only an entirely missing market family. It never adds a
    -- changed line beside an already published family.
    if exists (
      select 1
      from public.betting_markets existing_market
      where existing_market.game_id = target_game_id
        and existing_market.subject_player_id = target_player_id
        and existing_market.market_type = market_type_value
        and existing_market.generation_run_id <> generated_run_id
    ) then continue; end if;
    if length(market_key_value) < 1 then raise exception 'Every market needs a key'; end if;
    if length(trim(coalesce(market_item ->> 'title', ''))) < 1 then raise exception 'Every market needs a title'; end if;
    if nullif(market_item ->> 'line', '')::numeric is null
       or nullif(market_item ->> 'line', '')::numeric < 0
    then raise exception 'Personal markets need a valid line'; end if;
    if market_type_value = 'goalkeeper_saves'
       and not exists (
         select 1
         from public.game_lineups target_lineup
         where target_lineup.game_id = target_game_id
           and target_lineup.player_id = target_player_id
           and target_lineup.role = 'goalkeeper'
       )
    then raise exception 'Goalkeeper-save markets require a goalkeeper'; end if;
    if coalesce(jsonb_typeof(market_item -> 'outcomes'), 'null') <> 'array'
       or jsonb_array_length(market_item -> 'outcomes') < 2
    then raise exception 'Every market needs at least two outcomes'; end if;

    insert into public.betting_markets(
      game_id,
      generation_run_id,
      market_key,
      market_type,
      title,
      subject_player_id,
      subject_team,
      line,
      status,
      invalidated
    ) values (
      target_game_id,
      generated_run_id,
      market_key_value,
      market_type_value,
      trim(market_item ->> 'title'),
      target_player_id,
      null,
      nullif(market_item ->> 'line', '')::numeric,
      'suspended',
      false
    )
    returning id into generated_market_id;

    outcome_count := 0;
    for outcome_item in select value from jsonb_array_elements(market_item -> 'outcomes')
    loop
      if coalesce(outcome_item ->> 'outcome_key', '') not in ('over', 'under')
         or length(trim(coalesce(outcome_item ->> 'label', ''))) < 1
         or (outcome_item ->> 'fair_probability')::numeric <= 0
         or (outcome_item ->> 'fair_probability')::numeric >= 1
         or (outcome_item ->> 'offered_odds')::numeric < 1.01
      then raise exception 'A repaired outcome is invalid'; end if;

      insert into public.betting_outcomes(
        market_id,
        outcome_key,
        label,
        fair_probability,
        offered_odds
      ) values (
        generated_market_id,
        outcome_item ->> 'outcome_key',
        trim(outcome_item ->> 'label'),
        (outcome_item ->> 'fair_probability')::numeric,
        (outcome_item ->> 'offered_odds')::numeric
      );
      outcome_count := outcome_count + 1;
    end loop;

    select sum(fair_probability)
    into probability_total
    from public.betting_outcomes
    where market_id = generated_market_id;
    if outcome_count < 2 or abs(probability_total - 1) > 0.02 then
      raise exception 'Fair probabilities for each repaired market must total approximately 100%%';
    end if;

    added_count := added_count + 1;
    added_keys := added_keys || jsonb_build_array(market_key_value);
  end loop;

  if added_count = 0 then
    raise exception 'No entirely missing personal market family was found for this player';
  end if;

  update public.betting_markets repaired_market
  set invalidated = false, updated_at = now()
  where repaired_market.game_id = target_game_id
    and repaired_market.status = 'suspended'
    and repaired_market.invalidated;

  insert into public.admin_audit_log(
    admin_user_id,
    game_id,
    action,
    reason,
    before_data,
    after_data
  ) values (
    auth.uid(),
    target_game_id,
    'betting_missing_player_markets_repaired',
    'A lineup player became individually betting-eligible after prices were published',
    before_data,
    jsonb_build_object(
      'player_id', target_player_id,
      'generation_run_id', generated_run_id,
      'added_market_count', added_count,
      'added_market_keys', added_keys,
      'status', 'suspended',
      'existing_odds_changed', false,
      'accepted_slips_changed', false
    )
  );

  return jsonb_build_object(
    'player_id', target_player_id,
    'added_market_count', added_count,
    'added_market_keys', added_keys,
    'status', 'suspended',
    'existing_odds_preserved', true,
    'accepted_slips_preserved', true
  );
end;
$$;

revoke all on function public.admin_repair_missing_player_markets(uuid, uuid, text, jsonb, jsonb) from public;
grant execute on function public.admin_repair_missing_player_markets(uuid, uuid, text, jsonb, jsonb) to authenticated;
