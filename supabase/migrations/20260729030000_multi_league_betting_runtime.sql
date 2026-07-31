begin;

-- The legacy placement RPC assumes one global settings row. Keep it unavailable
-- once multiple leagues exist and expose a tenant-aware replacement instead.
revoke all on function public.place_bet(uuid, uuid[], numeric, uuid) from public, anon, authenticated;

create or replace function public.place_league_bet(
  target_game_id uuid,
  selected_outcome_ids uuid[],
  stake_coins numeric,
  client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_game public.games%rowtype;
  target_wallet public.betting_wallets%rowtype;
  target_league public.leagues%rowtype;
  created_slip_id uuid;
  selected_count integer;
  selected_market_count integer;
  selected_group_count integer;
  product_odds numeric := 1;
  accepted_total_odds numeric;
  stake_units bigint;
  payout_units bigint;
  payout_numeric numeric;
  lock_minutes_value integer;
  builder_margin_value numeric;
  max_builder_selections_value integer;
  max_total_odds_value numeric;
  max_potential_payout_value bigint;
  max_bets_per_minute_value integer;
  target_outcome record;
  existing_slip public.bet_slips%rowtype;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  if client_request_id is null then raise exception 'A request id is required'; end if;

  select * into target_game
  from public.games
  where id = target_game_id
  for update;
  if not found then raise exception 'Game not found'; end if;

  if not public.is_league_member(target_game.league_id, current_user_id) then
    raise exception 'Active league membership required';
  end if;

  select * into target_league
  from public.leagues
  where id = target_game.league_id
    and status = 'active';
  if not found or not target_league.betting_enabled then
    raise exception 'Betting is disabled for this league';
  end if;
  if (
    select count(*)
    from public.games completed_game
    where completed_game.league_id = target_game.league_id
      and completed_game.status = 'final'
  ) < target_league.betting_unlock_after_games then
    raise exception 'Betting is not unlocked for this league yet';
  end if;

  select * into existing_slip
  from public.bet_slips
  where league_id = target_game.league_id
    and user_id = current_user_id
    and request_id = client_request_id;
  if found then
    return jsonb_build_object(
      'slip_id', existing_slip.id,
      'balance_units', (
        select balance_units
        from public.betting_wallets
        where id = existing_slip.wallet_id
      ),
      'accepted_odds', existing_slip.accepted_odds,
      'potential_payout_units', existing_slip.potential_payout_units
    );
  end if;

  select
    lock_minutes,
    builder_margin,
    max_builder_selections,
    max_total_odds,
    max_potential_payout_units,
    max_bets_per_minute
  into
    lock_minutes_value,
    builder_margin_value,
    max_builder_selections_value,
    max_total_odds_value,
    max_potential_payout_value,
    max_bets_per_minute_value
  from public.betting_settings
  where league_id = target_game.league_id;
  if not found then raise exception 'Betting settings are missing'; end if;

  selected_count := coalesce(array_length(selected_outcome_ids, 1), 0);
  if selected_count < 1 or selected_count > max_builder_selections_value then
    raise exception 'Choose between one and % selections', max_builder_selections_value;
  end if;
  if (
    select count(distinct value)
    from unnest(selected_outcome_ids) value
  ) <> selected_count then
    raise exception 'Selections must be unique';
  end if;
  if stake_coins is null
     or stake_coins <= 0
     or round(stake_coins, 2) <> stake_coins
     or stake_coins * 100 > 9223372036854775807::numeric
  then
    raise exception 'Stake must be a positive amount with no more than two decimals';
  end if;
  stake_units := round(stake_coins * 100)::bigint;

  -- Serialize placements by league and user. A user may place bets in two
  -- leagues concurrently without racing either league wallet.
  perform pg_advisory_xact_lock(
    hashtextextended(target_game.league_id::text || ':' || current_user_id::text, 0)
  );
  if (
    select count(*)
    from public.bet_slips
    where league_id = target_game.league_id
      and user_id = current_user_id
      and placed_at > now() - interval '1 minute'
  ) >= max_bets_per_minute_value then
    raise exception 'Too many bets were placed at once. Wait a minute and try again';
  end if;

  if target_game.status not in ('upcoming', 'draft')
     or now() >= target_game.game_date - make_interval(mins => lock_minutes_value)
  then
    raise exception 'Betting is closed for this game';
  end if;
  if target_game.season_id is null then raise exception 'This game has no season'; end if;

  select
    count(*),
    count(distinct market.id),
    count(distinct (
      market.market_type
      || ':'
      || coalesce(
        market.subject_player_id::text,
        market.subject_team::text,
        'game'
      )
    )),
    coalesce(exp(sum(ln(outcome.offered_odds))), 1)
  into
    selected_count,
    selected_market_count,
    selected_group_count,
    product_odds
  from unnest(selected_outcome_ids) picked(outcome_id)
  join public.betting_outcomes outcome
    on outcome.id = picked.outcome_id
   and outcome.league_id = target_game.league_id
  join public.betting_markets market
    on market.id = outcome.market_id
   and market.league_id = target_game.league_id
  where market.game_id = target_game_id
    and market.status = 'open'
    and not market.invalidated;

  if selected_count <> array_length(selected_outcome_ids, 1) then
    raise exception 'One or more selections are unavailable';
  end if;
  if selected_market_count <> selected_count then
    raise exception 'Choose only one outcome from each market';
  end if;
  if selected_group_count <> selected_count then
    raise exception 'Choose only one line from each player or market category';
  end if;

  accepted_total_odds := case
    when selected_count = 1 then product_odds
    else greatest(1.01, 1 + (product_odds - 1) * (1 - builder_margin_value))
  end;
  accepted_total_odds := round(accepted_total_odds, 4);
  if accepted_total_odds > max_total_odds_value then
    raise exception 'Combined odds exceed the safe betting limit';
  end if;

  payout_numeric := round(stake_units::numeric * accepted_total_odds);
  if payout_numeric > max_potential_payout_value then
    raise exception 'Potential return exceeds the safe payout limit';
  end if;
  payout_units := payout_numeric::bigint;

  perform public.initialize_betting_wallet(current_user_id, target_game.season_id);
  select * into target_wallet
  from public.betting_wallets
  where league_id = target_game.league_id
    and user_id = current_user_id
    and season_id = target_game.season_id
  for update;
  if target_wallet.balance_units < stake_units then raise exception 'Not enough coins'; end if;

  insert into public.bet_slips (
    league_id,
    user_id,
    wallet_id,
    game_id,
    season_id,
    slip_type,
    stake_units,
    accepted_odds,
    potential_payout_units,
    request_id
  )
  values (
    target_game.league_id,
    current_user_id,
    target_wallet.id,
    target_game_id,
    target_game.season_id,
    case when selected_count = 1 then 'single' else 'builder' end,
    stake_units,
    accepted_total_odds,
    payout_units,
    client_request_id
  )
  returning id into created_slip_id;

  for target_outcome in
    select outcome.*, market.id as selected_market_id
    from unnest(selected_outcome_ids) picked(outcome_id)
    join public.betting_outcomes outcome
      on outcome.id = picked.outcome_id
     and outcome.league_id = target_game.league_id
    join public.betting_markets market
      on market.id = outcome.market_id
     and market.league_id = target_game.league_id
  loop
    insert into public.bet_legs (
      league_id,
      slip_id,
      market_id,
      outcome_id,
      accepted_odds,
      fair_probability
    )
    values (
      target_game.league_id,
      created_slip_id,
      target_outcome.selected_market_id,
      target_outcome.id,
      target_outcome.offered_odds,
      target_outcome.fair_probability
    );
  end loop;

  update public.betting_wallets
  set balance_units = balance_units - stake_units, updated_at = now()
  where id = target_wallet.id
    and league_id = target_game.league_id
  returning balance_units into target_wallet.balance_units;

  insert into public.coin_ledger (
    league_id,
    wallet_id,
    slip_id,
    entry_type,
    amount_units,
    balance_after_units,
    idempotency_key,
    metadata
  )
  values (
    target_game.league_id,
    target_wallet.id,
    created_slip_id,
    'stake',
    -stake_units,
    target_wallet.balance_units,
    'stake:' || created_slip_id::text,
    jsonb_build_object(
      'league_id', target_game.league_id,
      'game_id', target_game_id,
      'accepted_odds', accepted_total_odds
    )
  );

  return jsonb_build_object(
    'slip_id', created_slip_id,
    'balance_units', target_wallet.balance_units,
    'accepted_odds', accepted_total_odds,
    'potential_payout_units', payout_units
  );
end;
$$;

revoke all on function public.place_league_bet(uuid, uuid[], numeric, uuid) from public;
grant execute on function public.place_league_bet(uuid, uuid[], numeric, uuid) to authenticated;

-- Standings are shared inside a league, but never across leagues.
create or replace function public.get_betting_standings(target_season_id uuid)
returns table (
  user_id uuid,
  username text,
  balance_units bigint,
  settled_profit_units bigint,
  total_bets bigint,
  settled_bets bigint,
  won_bets bigint
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  target_league_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select season.league_id into target_league_id
  from public.seasons season
  where season.id = target_season_id;
  if target_league_id is null then raise exception 'Season not found'; end if;
  if not public.is_league_member(target_league_id, auth.uid()) then
    raise exception 'Active league membership required';
  end if;

  return query
  select
    profile.id,
    profile.username,
    coalesce(wallet.balance_units, settings.starting_balance_units)::bigint,
    coalesce(summary.settled_profit_units, 0)::bigint,
    coalesce(summary.total_bets, 0)::bigint,
    coalesce(summary.settled_bets, 0)::bigint,
    coalesce(summary.won_bets, 0)::bigint
  from public.league_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
   and coalesce(profile.account_status, 'active') = 'active'
  join public.betting_settings settings
    on settings.league_id = membership.league_id
  left join public.betting_wallets wallet
    on wallet.league_id = membership.league_id
   and wallet.user_id = membership.user_id
   and wallet.season_id = target_season_id
  left join lateral (
    select
      count(*) filter (where slip.status <> 'cashed_out')::bigint as total_bets,
      count(*) filter (where slip.status in ('won', 'lost', 'void'))::bigint as settled_bets,
      count(*) filter (where slip.status = 'won')::bigint as won_bets,
      coalesce(
        sum(coalesce(slip.settled_payout_units, 0) - slip.stake_units)
          filter (where slip.status in ('won', 'lost', 'void')),
        0
      )::bigint as settled_profit_units
    from public.bet_slips slip
    where slip.league_id = target_league_id
      and slip.user_id = membership.user_id
      and slip.season_id = target_season_id
  ) summary on true
  where membership.league_id = target_league_id
    and membership.status = 'active'
  order by
    coalesce(summary.settled_profit_units, 0) desc,
    coalesce(wallet.balance_units, settings.starting_balance_units) desc,
    profile.username;
end;
$$;

revoke all on function public.get_betting_standings(uuid) from public;
grant execute on function public.get_betting_standings(uuid) to authenticated;

-- Odds generation runs on the server. League admins trigger it by saving a
-- lineup, but never receive model snapshots or model controls.
create or replace function public.system_generate_league_betting_markets(
  target_game_id uuid,
  target_actor_id uuid,
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
  target_league public.leagues%rowtype;
  generated_run_id uuid;
  generated_market_id uuid;
  market_item jsonb;
  outcome_item jsonb;
  lock_minutes_value integer;
  outcome_count integer;
  probability_total numeric;
  market_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server access required';
  end if;
  if length(trim(coalesce(target_model_version, ''))) < 1 then
    raise exception 'Model version is required';
  end if;
  if coalesce(jsonb_typeof(submitted_markets), 'null') <> 'array'
     or jsonb_array_length(submitted_markets) = 0
  then raise exception 'Generated markets are required'; end if;

  select * into target_game
  from public.games
  where id = target_game_id
  for update;
  if not found then raise exception 'Game not found'; end if;
  if not public.is_league_admin(target_game.league_id, target_actor_id) then
    raise exception 'League admin access required';
  end if;
  select * into target_league
  from public.leagues
  where id = target_game.league_id
    and status = 'active';
  if not found or not target_league.betting_enabled then
    return jsonb_build_object('generated', false, 'reason', 'betting_disabled');
  end if;
  if (
    select count(*) from public.games completed_game
    where completed_game.league_id = target_game.league_id
      and completed_game.status = 'final'
  ) < target_league.betting_unlock_after_games then
    return jsonb_build_object('generated', false, 'reason', 'cold_start');
  end if;

  select settings.lock_minutes into lock_minutes_value
  from public.betting_settings settings
  where settings.league_id = target_game.league_id;
  if lock_minutes_value is null then raise exception 'Betting settings are missing'; end if;
  if target_game.status not in ('upcoming', 'draft')
     or now() >= target_game.game_date - make_interval(mins => lock_minutes_value)
  then return jsonb_build_object('generated', false, 'reason', 'betting_locked'); end if;
  if (
    select count(*) from public.game_lineups lineup
    where lineup.league_id = target_game.league_id
      and lineup.game_id = target_game_id
  ) <> 10 then raise exception 'Save both five-player lineups before generating odds'; end if;

  -- Accepted odds are immutable. A risky lineup edit suspends the old markets
  -- through the existing trigger and preserves every accepted bet for review.
  if exists (
    select 1 from public.bet_slips slip
    where slip.league_id = target_game.league_id
      and slip.game_id = target_game_id
  ) then
    return jsonb_build_object(
      'generated', false,
      'reason', 'accepted_bets_preserved',
      'requires_review', true
    );
  end if;

  delete from public.betting_markets
  where league_id = target_game.league_id
    and game_id = target_game_id;

  insert into public.odds_generation_runs(
    league_id,
    game_id,
    model_version,
    input_snapshot,
    generated_by
  )
  values (
    target_game.league_id,
    target_game_id,
    trim(target_model_version),
    coalesce(target_input_snapshot, '{}'::jsonb),
    target_actor_id
  )
  returning id into generated_run_id;

  for market_item in
    select value from jsonb_array_elements(submitted_markets)
  loop
    if coalesce(market_item ->> 'market_type', '') not in (
      'match_result',
      'total_goals',
      'player_goals',
      'player_assists',
      'goalkeeper_saves',
      'team_saves',
      'own_goal'
    ) then raise exception 'Unsupported market type'; end if;
    if length(trim(coalesce(market_item ->> 'market_key', ''))) < 1
       or length(trim(coalesce(market_item ->> 'title', ''))) < 1
    then raise exception 'Every market needs a key and title'; end if;
    if coalesce(jsonb_typeof(market_item -> 'outcomes'), 'null') <> 'array'
       or jsonb_array_length(market_item -> 'outcomes') < 2
    then raise exception 'Every market needs at least two outcomes'; end if;

    if coalesce(market_item ->> 'market_type', '') in (
      'player_goals',
      'player_assists',
      'goalkeeper_saves'
    ) and not exists (
      select 1
      from public.game_lineups lineup
      join public.players player
        on player.id = lineup.player_id
       and player.league_id = lineup.league_id
      where lineup.league_id = target_game.league_id
        and lineup.game_id = target_game_id
        and lineup.player_id = nullif(market_item ->> 'subject_player_id', '')::uuid
        and player.individual_betting_eligible
        and (
          coalesce(market_item ->> 'market_type', '') <> 'goalkeeper_saves'
          or lineup.role = 'goalkeeper'
        )
    ) then raise exception 'Individual markets must use eligible players in the confirmed lineup'; end if;
    if coalesce(market_item ->> 'market_type', '') = 'team_saves'
       and coalesce(market_item ->> 'subject_team', '') not in ('A', 'B')
    then raise exception 'Team-save markets need Team A or Team B'; end if;

    insert into public.betting_markets(
      league_id,
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
    )
    values (
      target_game.league_id,
      target_game_id,
      generated_run_id,
      trim(market_item ->> 'market_key'),
      market_item ->> 'market_type',
      trim(market_item ->> 'title'),
      nullif(market_item ->> 'subject_player_id', '')::uuid,
      nullif(market_item ->> 'subject_team', '')::public.team_code,
      nullif(market_item ->> 'line', '')::numeric,
      'open',
      false
    )
    returning id into generated_market_id;

    outcome_count := 0;
    for outcome_item in
      select value from jsonb_array_elements(market_item -> 'outcomes')
    loop
      if length(trim(coalesce(outcome_item ->> 'outcome_key', ''))) < 1
         or length(trim(coalesce(outcome_item ->> 'label', ''))) < 1
         or (outcome_item ->> 'fair_probability')::numeric <= 0
         or (outcome_item ->> 'fair_probability')::numeric >= 1
         or (outcome_item ->> 'offered_odds')::numeric < 1.01
      then raise exception 'Probabilities or odds are outside the allowed range'; end if;
      insert into public.betting_outcomes(
        league_id,
        market_id,
        outcome_key,
        label,
        fair_probability,
        offered_odds
      )
      values (
        target_game.league_id,
        generated_market_id,
        outcome_item ->> 'outcome_key',
        trim(outcome_item ->> 'label'),
        (outcome_item ->> 'fair_probability')::numeric,
        (outcome_item ->> 'offered_odds')::numeric
      );
      outcome_count := outcome_count + 1;
    end loop;
    select sum(fair_probability) into probability_total
    from public.betting_outcomes
    where league_id = target_game.league_id
      and market_id = generated_market_id;
    if outcome_count < 2 or abs(probability_total - 1) > 0.02 then
      raise exception 'Fair probabilities for each market must total approximately 100%%';
    end if;
    market_count := market_count + 1;
  end loop;

  insert into public.admin_audit_log(
    league_id,
    admin_user_id,
    game_id,
    action,
    after_data
  )
  values (
    target_game.league_id,
    target_actor_id,
    target_game_id,
    'betting_markets_automatically_generated',
    jsonb_build_object(
      'generation_run_id', generated_run_id,
      'market_count', market_count,
      'status', 'open'
    )
  );

  return jsonb_build_object(
    'generated', true,
    'market_count', market_count,
    'status', 'open'
  );
end;
$$;

revoke all on function public.system_generate_league_betting_markets(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.system_generate_league_betting_markets(uuid, uuid, text, jsonb, jsonb) to service_role;

-- Settlement must use the settings, wallets, slips, and result version from the
-- same league. This replaces the legacy implementation that read settings id 1.
create or replace function public.settle_game_bets(
  target_game_id uuid,
  target_result_version_id uuid
)
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
  select *
  into target_result
  from public.game_result_versions
  where id = target_result_version_id
    and game_id = target_game_id;
  if not found then raise exception 'Result version not found'; end if;

  select settings.builder_margin
  into builder_margin_value
  from public.betting_settings settings
  where settings.league_id = target_result.league_id;
  if builder_margin_value is null then
    raise exception 'Betting settings are missing';
  end if;

  for target_slip in
    select *
    from public.bet_slips
    where league_id = target_result.league_id
      and game_id = target_game_id
      and status <> 'cashed_out'
    order by placed_at
    for update
  loop
    won_count := 0;
    lost_count := 0;
    void_count := 0;
    active_product_odds := 1;

    for target_leg in
      select
        leg.*,
        market.market_type,
        market.line,
        market.subject_player_id,
        market.subject_team,
        outcome.outcome_key
      from public.bet_legs leg
      join public.betting_markets market
        on market.id = leg.market_id
       and market.league_id = leg.league_id
      join public.betting_outcomes outcome
        on outcome.id = leg.outcome_id
       and outcome.league_id = leg.league_id
      where leg.league_id = target_result.league_id
        and leg.slip_id = target_slip.id
      order by leg.created_at
    loop
      if target_leg.market_type = 'team_saves' then
        select coalesce(sum((entry.value ->> 'saves')::numeric), 0)
        into actual_value
        from jsonb_each(target_result.player_totals) entry
        where entry.value ->> 'team' = target_leg.subject_team::text;
        leg_status := case
          when actual_value = target_leg.line then 'void'
          when target_leg.outcome_key = 'over'
            and actual_value > target_leg.line then 'won'
          when target_leg.outcome_key = 'under'
            and actual_value < target_leg.line then 'won'
          else 'lost'
        end;
      else
        leg_status := public.evaluate_bet_leg(
          target_leg.market_type,
          target_leg.outcome_key,
          target_leg.line,
          target_leg.subject_player_id,
          target_result
        );
        actual_value := case
          when target_leg.market_type = 'total_goals'
            then target_result.score_a + target_result.score_b
          when target_leg.market_type = 'own_goal'
            then target_result.own_goal_count
          when target_leg.market_type = 'player_goals'
            then (
              target_result.player_totals
                -> target_leg.subject_player_id::text
                ->> 'goals'
            )::numeric
          when target_leg.market_type = 'player_assists'
            then (
              target_result.player_totals
                -> target_leg.subject_player_id::text
                ->> 'assists'
            )::numeric
          when target_leg.market_type = 'goalkeeper_saves'
            then (
              target_result.player_totals
                -> target_leg.subject_player_id::text
                ->> 'saves'
            )::numeric
          else null
        end;
      end if;

      update public.bet_legs
      set status = leg_status, result_value = actual_value
      where league_id = target_result.league_id
        and id = target_leg.id;

      if leg_status = 'won' then
        won_count := won_count + 1;
        active_product_odds := active_product_odds * target_leg.accepted_odds;
      elsif leg_status = 'lost' then
        lost_count := lost_count + 1;
      else
        void_count := void_count + 1;
      end if;
    end loop;

    if lost_count > 0 then
      final_slip_status := 'lost';
      new_payout := 0;
    elsif won_count = 0 then
      final_slip_status := 'void';
      new_payout := target_slip.stake_units;
    else
      final_slip_status := 'won';
      final_odds := case
        when target_slip.slip_type = 'single' or void_count = 0
          then target_slip.accepted_odds
        else greatest(
          1.01,
          1 + (active_product_odds - 1) * (1 - builder_margin_value)
        )
      end;
      new_payout := round(target_slip.stake_units * final_odds)::bigint;
    end if;

    payout_delta := new_payout - coalesce(target_slip.settled_payout_units, 0);
    if payout_delta <> 0 then
      select *
      into target_wallet
      from public.betting_wallets
      where league_id = target_result.league_id
        and id = target_slip.wallet_id
      for update;
      if not found then raise exception 'Betting wallet not found'; end if;

      update public.betting_wallets
      set
        balance_units = balance_units + payout_delta,
        updated_at = now()
      where league_id = target_result.league_id
        and id = target_wallet.id
      returning balance_units into target_wallet.balance_units;

      insert into public.coin_ledger(
        league_id,
        wallet_id,
        slip_id,
        entry_type,
        amount_units,
        balance_after_units,
        idempotency_key,
        metadata
      )
      values (
        target_result.league_id,
        target_wallet.id,
        target_slip.id,
        case
          when target_slip.settled_payout_units is null then 'payout'
          else 'settlement_correction'
        end,
        payout_delta,
        target_wallet.balance_units,
        'settlement:'
          || target_slip.id::text
          || ':'
          || target_result_version_id::text,
        jsonb_build_object(
          'league_id', target_result.league_id,
          'result_version_id', target_result_version_id,
          'previous_payout_units', target_slip.settled_payout_units,
          'new_payout_units', new_payout
        )
      );
    end if;

    update public.bet_slips
    set
      status = final_slip_status,
      settled_payout_units = new_payout,
      settled_at = now(),
      result_version_id = target_result_version_id
    where league_id = target_result.league_id
      and id = target_slip.id;

    processed_count := processed_count + 1;
    if final_slip_status = 'won' then
      slips_won_count := slips_won_count + 1;
    elsif final_slip_status = 'lost' then
      slips_lost_count := slips_lost_count + 1;
    else
      slips_void_count := slips_void_count + 1;
    end if;
    total_adjustment := total_adjustment + payout_delta;
  end loop;

  update public.betting_markets
  set status = 'settled', updated_at = now()
  where league_id = target_result.league_id
    and game_id = target_game_id
    and status <> 'void';

  insert into public.bet_settlement_runs(
    league_id,
    game_id,
    result_version_id,
    settled_by,
    slips_processed,
    slips_won,
    slips_lost,
    slips_void,
    total_adjustment_units
  )
  values (
    target_result.league_id,
    target_game_id,
    target_result_version_id,
    auth.uid(),
    processed_count,
    slips_won_count,
    slips_lost_count,
    slips_void_count,
    total_adjustment
  );
end;
$$;

-- Model details and the former manual betting control surface are platform
-- concerns, not league-admin privileges.
revoke all on function public.admin_generate_betting_markets(uuid, text, jsonb, jsonb) from authenticated;
revoke all on function public.admin_set_betting_status(uuid, text) from authenticated;
revoke all on function public.admin_repair_missing_player_markets(uuid, uuid, text, jsonb, jsonb) from authenticated;
revoke all on function public.admin_update_betting_odds(uuid, numeric) from authenticated;
revoke all on function public.admin_adjust_betting_wallet(uuid, uuid, bigint, text, uuid) from authenticated;

commit;
