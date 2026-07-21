-- Virtual-coin betting foundation.
--
-- Important product boundaries:
--   * coins cannot be purchased, sold, transferred, or redeemed;
--   * every database mutation goes through a controlled function;
--   * accepted prices are immutable on bet legs;
--   * game finalization and settlement happen in the same transaction;
--   * corrections append a new result/ledger version instead of rewriting history.

create table if not exists public.betting_settings (
  id smallint primary key default 1 check (id = 1),
  starting_balance_units bigint not null default 10000 check (starting_balance_units > 0),
  lock_minutes integer not null default 5 check (lock_minutes between 0 and 1440),
  single_margin numeric(6, 5) not null default 0.06 check (single_margin between 0 and 0.5),
  builder_margin numeric(6, 5) not null default 0.10 check (builder_margin between 0 and 0.5),
  model_version text not null default 'player-lineup-v1',
  updated_at timestamptz not null default now()
);

insert into public.betting_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.odds_generation_runs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  model_version text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.betting_markets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  generation_run_id uuid not null references public.odds_generation_runs(id) on delete cascade,
  market_key text not null,
  market_type text not null check (market_type in ('match_result', 'total_goals', 'player_goals', 'player_assists', 'goalkeeper_saves', 'own_goal')),
  title text not null,
  subject_player_id uuid references public.players(id) on delete restrict,
  line numeric(8, 2),
  status text not null default 'draft' check (status in ('draft', 'open', 'suspended', 'locked', 'settled', 'void')),
  invalidated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, market_key),
  check (
    (market_type in ('player_goals', 'player_assists', 'goalkeeper_saves') and subject_player_id is not null)
    or (market_type not in ('player_goals', 'player_assists', 'goalkeeper_saves') and subject_player_id is null)
  ),
  check (
    (market_type in ('total_goals', 'player_goals', 'player_assists', 'goalkeeper_saves') and line is not null)
    or (market_type in ('match_result', 'own_goal') and line is null)
  ),
  check (line is null or line >= 0)
);

create table if not exists public.betting_outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.betting_markets(id) on delete cascade,
  outcome_key text not null,
  label text not null,
  fair_probability numeric(10, 8) not null check (fair_probability > 0 and fair_probability < 1),
  offered_odds numeric(12, 4) not null check (offered_odds >= 1.01),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, outcome_key)
);

create table if not exists public.betting_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  balance_units bigint not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, season_id)
);

create table if not exists public.bet_slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  wallet_id uuid not null references public.betting_wallets(id) on delete restrict,
  game_id uuid not null references public.games(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  slip_type text not null check (slip_type in ('single', 'builder')),
  stake_units bigint not null check (stake_units > 0),
  accepted_odds numeric(14, 4) not null check (accepted_odds >= 1.01),
  potential_payout_units bigint not null check (potential_payout_units >= 0),
  settled_payout_units bigint,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'void')),
  request_id uuid not null,
  placed_at timestamptz not null default now(),
  settled_at timestamptz,
  result_version_id uuid,
  unique (user_id, request_id)
);

create table if not exists public.bet_legs (
  id uuid primary key default gen_random_uuid(),
  slip_id uuid not null references public.bet_slips(id) on delete restrict,
  market_id uuid not null references public.betting_markets(id) on delete restrict,
  outcome_id uuid not null references public.betting_outcomes(id) on delete restrict,
  accepted_odds numeric(12, 4) not null check (accepted_odds >= 1.01),
  fair_probability numeric(10, 8) not null check (fair_probability > 0 and fair_probability < 1),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'void')),
  result_value numeric(10, 2),
  created_at timestamptz not null default now(),
  unique (slip_id, market_id),
  unique (slip_id, outcome_id)
);

create table if not exists public.game_result_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  score_a integer not null check (score_a >= 0),
  score_b integer not null check (score_b >= 0),
  own_goal_count integer not null default 0 check (own_goal_count >= 0),
  player_totals jsonb not null default '{}'::jsonb,
  source_summary jsonb not null default '{}'::jsonb,
  correction_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (game_id, version_number)
);

alter table public.bet_slips
  drop constraint if exists bet_slips_result_version_id_fkey;
alter table public.bet_slips
  add constraint bet_slips_result_version_id_fkey foreign key (result_version_id) references public.game_result_versions(id) on delete restrict;

create table if not exists public.bet_settlement_runs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  result_version_id uuid not null references public.game_result_versions(id) on delete restrict,
  settled_by uuid references public.profiles(id) on delete set null,
  slips_processed integer not null default 0,
  slips_won integer not null default 0,
  slips_lost integer not null default 0,
  slips_void integer not null default 0,
  total_adjustment_units bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, result_version_id)
);

create table if not exists public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.betting_wallets(id) on delete restrict,
  slip_id uuid references public.bet_slips(id) on delete restrict,
  entry_type text not null check (entry_type in ('initial_grant', 'stake', 'payout', 'settlement_correction')),
  amount_units bigint not null check (amount_units <> 0),
  balance_after_units bigint not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists betting_markets_game_status_idx on public.betting_markets(game_id, status);
create index if not exists betting_outcomes_market_idx on public.betting_outcomes(market_id);
create index if not exists betting_wallets_user_idx on public.betting_wallets(user_id, season_id);
create index if not exists bet_slips_user_date_idx on public.bet_slips(user_id, placed_at desc);
create index if not exists bet_slips_game_status_idx on public.bet_slips(game_id, status);
create index if not exists bet_legs_slip_idx on public.bet_legs(slip_id);
create index if not exists coin_ledger_wallet_date_idx on public.coin_ledger(wallet_id, created_at desc);
create index if not exists result_versions_game_idx on public.game_result_versions(game_id, version_number desc);

create or replace function public.initialize_betting_wallet(target_user_id uuid, target_season_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_wallet public.betting_wallets%rowtype;
  initial_units bigint;
begin
  if target_user_id is null or target_season_id is null then return null; end if;
  if not exists (select 1 from public.profiles where id = target_user_id)
     or not exists (select 1 from public.seasons where id = target_season_id)
  then return null; end if;

  select starting_balance_units into initial_units from public.betting_settings where id = 1;
  insert into public.betting_wallets(user_id, season_id, balance_units)
  values (target_user_id, target_season_id, initial_units)
  on conflict (user_id, season_id) do nothing;

  select * into target_wallet
  from public.betting_wallets
  where user_id = target_user_id and season_id = target_season_id
  for update;

  insert into public.coin_ledger(wallet_id, entry_type, amount_units, balance_after_units, idempotency_key, metadata)
  values (
    target_wallet.id,
    'initial_grant',
    initial_units,
    target_wallet.balance_units,
    'initial:' || target_user_id::text || ':' || target_season_id::text,
    jsonb_build_object('season_id', target_season_id)
  )
  on conflict (idempotency_key) do nothing;
  return target_wallet.id;
end;
$$;

create or replace function public.ensure_betting_wallet(target_season_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return public.initialize_betting_wallet(auth.uid(), target_season_id);
end;
$$;

create or replace function public.initialize_wallets_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target_season record;
begin
  for target_season in select id from public.seasons loop
    perform public.initialize_betting_wallet(new.id, target_season.id);
  end loop;
  return new;
end;
$$;

create or replace function public.initialize_wallets_for_season()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target_profile record;
begin
  for target_profile in select id from public.profiles loop
    perform public.initialize_betting_wallet(target_profile.id, new.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists initialize_betting_wallets_after_profile on public.profiles;
create trigger initialize_betting_wallets_after_profile
after insert on public.profiles
for each row execute function public.initialize_wallets_for_profile();

drop trigger if exists initialize_betting_wallets_after_season on public.seasons;
create trigger initialize_betting_wallets_after_season
after insert on public.seasons
for each row execute function public.initialize_wallets_for_season();

do $$
declare target_profile record; target_season record;
begin
  for target_profile in select id from public.profiles loop
    for target_season in select id from public.seasons loop
      perform public.initialize_betting_wallet(target_profile.id, target_season.id);
    end loop;
  end loop;
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
    if coalesce(market_item ->> 'market_type', '') not in ('match_result', 'total_goals', 'player_goals', 'player_assists', 'goalkeeper_saves', 'own_goal') then
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
         where lineup.game_id = target_game_id
           and lineup.player_id = nullif(market_item ->> 'subject_player_id', '')::uuid
           and (coalesce(market_item ->> 'market_type', '') <> 'goalkeeper_saves' or lineup.role = 'goalkeeper')
       )
    then raise exception 'Player markets must use eligible players in the confirmed lineup'; end if;

    insert into public.betting_markets(
      game_id, generation_run_id, market_key, market_type, title, subject_player_id, line
    ) values (
      target_game_id,
      generated_run_id,
      market_item ->> 'market_key',
      market_item ->> 'market_type',
      market_item ->> 'title',
      nullif(market_item ->> 'subject_player_id', '')::uuid,
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
         or ((market_item ->> 'market_type') in ('total_goals', 'player_goals', 'player_assists', 'goalkeeper_saves') and (outcome_item ->> 'outcome_key') not in ('over', 'under'))
         or ((market_item ->> 'market_type') = 'own_goal' and (outcome_item ->> 'outcome_key') not in ('yes', 'no'))
      then raise exception 'Outcome key does not match its market type'; end if;
      insert into public.betting_outcomes(market_id, outcome_key, label, fair_probability, offered_odds)
      values (
        generated_market_id,
        outcome_item ->> 'outcome_key',
        outcome_item ->> 'label',
        (outcome_item ->> 'fair_probability')::numeric,
        (outcome_item ->> 'offered_odds')::numeric
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

create or replace function public.admin_set_betting_status(target_game_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target_game public.games%rowtype; lock_minutes_value integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if new_status not in ('open', 'suspended') then raise exception 'Invalid market status'; end if;
  select * into target_game from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if not exists (select 1 from public.betting_markets where game_id = target_game_id) then raise exception 'Generate markets first'; end if;
  if new_status = 'open' then
    select lock_minutes into lock_minutes_value from public.betting_settings where id = 1;
    if target_game.status not in ('upcoming', 'draft') or now() >= target_game.game_date - make_interval(mins => lock_minutes_value) then
      raise exception 'Betting is already locked for this game';
    end if;
    if exists (select 1 from public.betting_markets where game_id = target_game_id and invalidated) then
      raise exception 'The game setup changed after these odds were generated. Generate and approve fresh markets.';
    end if;
    if exists (
      select 1 from public.betting_markets market
      where market.game_id = target_game_id
        and market.subject_player_id is not null
        and not exists (
          select 1 from public.game_lineups lineup
          where lineup.game_id = target_game_id and lineup.player_id = market.subject_player_id
        )
    ) then
      raise exception 'The lineup changed after odds were generated. Keep betting suspended and generate fresh markets when possible.';
    end if;
  end if;
  update public.betting_markets set status = new_status, updated_at = now()
  where game_id = target_game_id and status in ('draft', 'open', 'suspended');
  insert into public.admin_audit_log(admin_user_id, game_id, action, after_data)
  values (auth.uid(), target_game_id, 'betting_markets_' || new_status, jsonb_build_object('status', new_status));
end;
$$;

create or replace function public.suspend_betting_after_game_setup_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target_game_id uuid;
begin
  if tg_table_name = 'games' then
    target_game_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_game_id := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  end if;
  update public.betting_markets
  set status = 'suspended', invalidated = true, updated_at = now()
  where game_id = target_game_id and status in ('draft', 'open', 'suspended') and not invalidated;
  if found then
    insert into public.admin_audit_log(admin_user_id, game_id, action, after_data)
    values (auth.uid(), target_game_id, 'betting_auto_suspended', jsonb_build_object('reason', case when tg_table_name = 'games' then 'kickoff_changed' else 'lineup_changed' end));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists suspend_betting_after_lineup_change on public.game_lineups;
create trigger suspend_betting_after_lineup_change
after insert or update or delete on public.game_lineups
for each row execute function public.suspend_betting_after_game_setup_change();

drop trigger if exists suspend_betting_after_kickoff_change on public.games;
create trigger suspend_betting_after_kickoff_change
after update of game_date on public.games
for each row
when (old.game_date is distinct from new.game_date)
execute function public.suspend_betting_after_game_setup_change();

create or replace function public.admin_update_betting_odds(target_outcome_id uuid, new_odds numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare before_outcome jsonb; target_game_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if new_odds < 1.01 then raise exception 'Odds must be at least 1.01'; end if;
  select to_jsonb(outcome), market.game_id into before_outcome, target_game_id
  from public.betting_outcomes outcome
  join public.betting_markets market on market.id = outcome.market_id
  where outcome.id = target_outcome_id and market.status = 'draft'
  for update of outcome;
  if before_outcome is null then raise exception 'Only draft odds can be edited'; end if;
  update public.betting_outcomes set offered_odds = round(new_odds, 4), updated_at = now() where id = target_outcome_id;
  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (auth.uid(), target_game_id, 'betting_odds_adjusted', before_outcome, jsonb_build_object('outcome_id', target_outcome_id, 'offered_odds', round(new_odds, 4)));
end;
$$;

create or replace function public.place_bet(
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
  created_slip_id uuid;
  selected_count integer;
  selected_market_count integer;
  product_odds numeric := 1;
  accepted_total_odds numeric;
  stake_units bigint;
  payout_units bigint;
  lock_minutes_value integer;
  builder_margin_value numeric;
  target_outcome record;
  existing_slip public.bet_slips%rowtype;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  if client_request_id is null then raise exception 'A request id is required'; end if;
  select * into existing_slip from public.bet_slips where user_id = current_user_id and request_id = client_request_id;
  if found then
    return jsonb_build_object('slip_id', existing_slip.id, 'balance_units', (select balance_units from public.betting_wallets where id = existing_slip.wallet_id), 'accepted_odds', existing_slip.accepted_odds, 'potential_payout_units', existing_slip.potential_payout_units);
  end if;

  selected_count := coalesce(array_length(selected_outcome_ids, 1), 0);
  if selected_count < 1 or selected_count > 5 then raise exception 'Choose between one and five selections'; end if;
  if (select count(distinct value) from unnest(selected_outcome_ids) value) <> selected_count then raise exception 'Selections must be unique'; end if;
  if stake_coins is null or stake_coins <= 0 or round(stake_coins, 2) <> stake_coins then raise exception 'Stake must be a positive amount with no more than two decimals'; end if;
  stake_units := round(stake_coins * 100)::bigint;

  select * into target_game from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  select lock_minutes, builder_margin into lock_minutes_value, builder_margin_value from public.betting_settings where id = 1;
  if target_game.status not in ('upcoming', 'draft') or now() >= target_game.game_date - make_interval(mins => lock_minutes_value) then
    raise exception 'Betting closed five minutes before kick-off';
  end if;
  if target_game.season_id is null then raise exception 'This game has no season'; end if;

  select count(*), count(distinct market.id), coalesce(exp(sum(ln(outcome.offered_odds))), 1)
  into selected_count, selected_market_count, product_odds
  from unnest(selected_outcome_ids) picked(outcome_id)
  join public.betting_outcomes outcome on outcome.id = picked.outcome_id
  join public.betting_markets market on market.id = outcome.market_id
  where market.game_id = target_game_id and market.status = 'open';
  if selected_count <> array_length(selected_outcome_ids, 1) then raise exception 'One or more selections are unavailable'; end if;
  if selected_market_count <> selected_count then raise exception 'Choose only one outcome from each market'; end if;

  -- Builders receive an additional conservative reserve because same-game legs
  -- are correlated. The immutable price is shown before placement and preserved.
  accepted_total_odds := case
    when selected_count = 1 then product_odds
    else greatest(1.01, 1 + (product_odds - 1) * (1 - builder_margin_value))
  end;
  accepted_total_odds := round(accepted_total_odds, 4);
  payout_units := round(stake_units * accepted_total_odds)::bigint;

  perform public.initialize_betting_wallet(current_user_id, target_game.season_id);
  select * into target_wallet from public.betting_wallets
  where user_id = current_user_id and season_id = target_game.season_id for update;
  if target_wallet.balance_units < stake_units then raise exception 'Not enough coins'; end if;

  insert into public.bet_slips(user_id, wallet_id, game_id, season_id, slip_type, stake_units, accepted_odds, potential_payout_units, request_id)
  values (current_user_id, target_wallet.id, target_game_id, target_game.season_id, case when selected_count = 1 then 'single' else 'builder' end, stake_units, accepted_total_odds, payout_units, client_request_id)
  returning id into created_slip_id;

  for target_outcome in
    select outcome.*, market.id as selected_market_id
    from unnest(selected_outcome_ids) picked(outcome_id)
    join public.betting_outcomes outcome on outcome.id = picked.outcome_id
    join public.betting_markets market on market.id = outcome.market_id
  loop
    insert into public.bet_legs(slip_id, market_id, outcome_id, accepted_odds, fair_probability)
    values (created_slip_id, target_outcome.selected_market_id, target_outcome.id, target_outcome.offered_odds, target_outcome.fair_probability);
  end loop;

  update public.betting_wallets set balance_units = balance_units - stake_units, updated_at = now()
  where id = target_wallet.id returning balance_units into target_wallet.balance_units;
  insert into public.coin_ledger(wallet_id, slip_id, entry_type, amount_units, balance_after_units, idempotency_key, metadata)
  values (target_wallet.id, created_slip_id, 'stake', -stake_units, target_wallet.balance_units, 'stake:' || created_slip_id::text, jsonb_build_object('game_id', target_game_id, 'accepted_odds', accepted_total_odds));

  return jsonb_build_object('slip_id', created_slip_id, 'balance_units', target_wallet.balance_units, 'accepted_odds', accepted_total_odds, 'potential_payout_units', payout_units);
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
    coalesce(sum(case
      when event.event_type = 'goal' and lineup.team = 'A' then 1
      when event.event_type = 'own_goal' and lineup.team = 'B' then 1
      else 0 end), 0),
    coalesce(sum(case
      when event.event_type = 'goal' and lineup.team = 'B' then 1
      when event.event_type = 'own_goal' and lineup.team = 'A' then 1
      else 0 end), 0),
    coalesce(sum(case when event.event_type = 'own_goal' then 1 else 0 end), 0),
    count(event.id)
  into score_a_value, score_b_value, own_goals_value, event_count_value
  from public.events event
  left join public.game_lineups lineup on lineup.game_id = event.game_id and lineup.player_id = event.player_id
  where event.game_id = target_game_id;

  select
    score_a_value + coalesce(sum(case when stat.team = 'A' then stat.goals else 0 end), 0),
    score_b_value + coalesce(sum(case when stat.team = 'B' then stat.goals else 0 end), 0),
    count(stat.id)
  into score_a_value, score_b_value, stat_count_value
  from public.game_player_stats stat where stat.game_id = target_game_id;

  select coalesce(jsonb_object_agg(player_result.player_id::text, jsonb_build_object(
    'team', player_result.team,
    'role', player_result.role,
    'goals', player_result.goals,
    'assists', player_result.assists,
    'saves', player_result.saves,
    'own_goals', player_result.own_goals
  )), '{}'::jsonb)
  into player_totals_value
  from (
    select
      lineup.player_id,
      lineup.team,
      lineup.role,
      coalesce((select count(*) from public.events event where event.game_id = target_game_id and event.event_type = 'goal' and event.player_id = lineup.player_id), 0)
        + coalesce(stat.goals, 0) as goals,
      coalesce((select count(*) from public.events event where event.game_id = target_game_id and event.event_type = 'goal' and event.assist_player_id = lineup.player_id), 0)
        + coalesce(stat.assists, 0) as assists,
      coalesce(stat.saves, 0) as saves,
      coalesce((select count(*) from public.events event where event.game_id = target_game_id and event.event_type = 'own_goal' and event.player_id = lineup.player_id), 0) as own_goals
    from public.game_lineups lineup
    left join public.game_player_stats stat on stat.game_id = lineup.game_id and stat.player_id = lineup.player_id
    where lineup.game_id = target_game_id
  ) player_result;

  insert into public.game_result_versions(
    game_id, version_number, score_a, score_b, own_goal_count, player_totals,
    source_summary, correction_reason, created_by
  ) values (
    target_game_id, next_version, score_a_value, score_b_value, own_goals_value,
    player_totals_value,
    jsonb_build_object('events', event_count_value, 'manual_stat_rows', stat_count_value, 'aggregation', 'events_plus_manual_stats'),
    target_reason, auth.uid()
  ) returning id into created_version_id;
  return created_version_id;
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
immutable
as $$
declare actual_value numeric; actual_key text; player_result jsonb;
begin
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
begin
  select * into target_result from public.game_result_versions where id = target_result_version_id and game_id = target_game_id;
  if not found then raise exception 'Result version not found'; end if;
  select builder_margin into builder_margin_value from public.betting_settings where id = 1;

  for target_slip in select * from public.bet_slips where game_id = target_game_id order by placed_at for update loop
    won_count := 0; lost_count := 0; void_count := 0; active_product_odds := 1;
    for target_leg in
      select leg.*, market.market_type, market.line, market.subject_player_id, outcome.outcome_key
      from public.bet_legs leg
      join public.betting_markets market on market.id = leg.market_id
      join public.betting_outcomes outcome on outcome.id = leg.outcome_id
      where leg.slip_id = target_slip.id
      order by leg.created_at
    loop
      leg_status := public.evaluate_bet_leg(target_leg.market_type, target_leg.outcome_key, target_leg.line, target_leg.subject_player_id, target_result);
      update public.bet_legs
      set status = leg_status,
          result_value = case
            when target_leg.market_type = 'total_goals' then target_result.score_a + target_result.score_b
            when target_leg.market_type = 'own_goal' then target_result.own_goal_count
            when target_leg.market_type in ('player_goals', 'player_assists', 'goalkeeper_saves') then
              case target_leg.market_type
                when 'player_goals' then (target_result.player_totals -> target_leg.subject_player_id::text ->> 'goals')::numeric
                when 'player_assists' then (target_result.player_totals -> target_leg.subject_player_id::text ->> 'assists')::numeric
                else (target_result.player_totals -> target_leg.subject_player_id::text ->> 'saves')::numeric
              end
            else null end
      where id = target_leg.id;
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
        target_wallet.id,
        target_slip.id,
        case when target_slip.settled_payout_units is null then 'payout' else 'settlement_correction' end,
        payout_delta,
        target_wallet.balance_units,
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

-- Replace the latest controlled status function so finalization and settlement
-- are one atomic database transaction. Any settlement failure rolls back final.
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
    if lineup_count <> 10
       or exists (
         select 1 from (values ('A'::public.team_code), ('B'::public.team_code)) teams(team)
         where (select count(*) from public.game_lineups where game_id = target_game_id and team = teams.team) <> 5
            or (select count(*) from public.game_lineups where game_id = target_game_id and team = teams.team and role = 'goalkeeper') <> 1
       )
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

alter table public.betting_settings enable row level security;
alter table public.odds_generation_runs enable row level security;
alter table public.betting_markets enable row level security;
alter table public.betting_outcomes enable row level security;
alter table public.betting_wallets enable row level security;
alter table public.bet_slips enable row level security;
alter table public.bet_legs enable row level security;
alter table public.game_result_versions enable row level security;
alter table public.bet_settlement_runs enable row level security;
alter table public.coin_ledger enable row level security;

create policy "betting settings readable" on public.betting_settings for select to authenticated using (true);
create policy "betting generations admin readable" on public.odds_generation_runs for select to authenticated using (public.is_admin());
create policy "published betting markets readable" on public.betting_markets for select to authenticated using (status <> 'draft' or public.is_admin());
create policy "published betting outcomes readable" on public.betting_outcomes for select to authenticated using (
  exists (select 1 from public.betting_markets market where market.id = betting_outcomes.market_id and (market.status <> 'draft' or public.is_admin()))
);
create policy "wallets owner readable" on public.betting_wallets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "slips owner readable" on public.bet_slips for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "legs owner readable" on public.bet_legs for select to authenticated using (
  exists (select 1 from public.bet_slips slip where slip.id = bet_legs.slip_id and (slip.user_id = auth.uid() or public.is_admin()))
);
create policy "result versions readable" on public.game_result_versions for select to authenticated using (true);
create policy "settlement runs admin readable" on public.bet_settlement_runs for select to authenticated using (public.is_admin());
create policy "coin ledger owner readable" on public.coin_ledger for select to authenticated using (
  exists (select 1 from public.betting_wallets wallet where wallet.id = coin_ledger.wallet_id and (wallet.user_id = auth.uid() or public.is_admin()))
);

revoke all on public.betting_settings, public.odds_generation_runs, public.betting_markets, public.betting_outcomes,
  public.betting_wallets, public.bet_slips, public.bet_legs, public.game_result_versions,
  public.bet_settlement_runs, public.coin_ledger from anon, authenticated;
grant select on public.betting_settings, public.odds_generation_runs, public.betting_markets, public.betting_outcomes,
  public.betting_wallets, public.bet_slips, public.bet_legs, public.game_result_versions,
  public.bet_settlement_runs, public.coin_ledger to authenticated;

revoke all on function public.initialize_betting_wallet(uuid, uuid) from public;
revoke all on function public.ensure_betting_wallet(uuid) from public;
revoke all on function public.admin_generate_betting_markets(uuid, text, jsonb, jsonb) from public;
revoke all on function public.admin_set_betting_status(uuid, text) from public;
revoke all on function public.admin_update_betting_odds(uuid, numeric) from public;
revoke all on function public.place_bet(uuid, uuid[], numeric, uuid) from public;
revoke all on function public.create_game_result_version(uuid, text) from public;
revoke all on function public.settle_game_bets(uuid, uuid) from public;
revoke all on function public.evaluate_bet_leg(text, text, numeric, uuid, public.game_result_versions) from public;
grant execute on function public.ensure_betting_wallet(uuid) to authenticated;
grant execute on function public.admin_generate_betting_markets(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_set_betting_status(uuid, text) to authenticated;
grant execute on function public.admin_update_betting_odds(uuid, numeric) to authenticated;
grant execute on function public.place_bet(uuid, uuid[], numeric, uuid) to authenticated;
