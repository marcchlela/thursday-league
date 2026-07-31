-- Security hardening for private match data, bet placement, and API throttling.

alter table public.betting_settings
  add column if not exists max_builder_selections integer not null default 5
    check (max_builder_selections between 2 and 10),
  add column if not exists max_total_odds numeric(14, 4) not null default 10000
    check (max_total_odds between 1.01 and 1000000),
  add column if not exists max_potential_payout_units bigint not null default 1000000
    check (max_potential_payout_units > 0),
  add column if not exists max_bets_per_minute integer not null default 10
    check (max_bets_per_minute between 1 and 120);

-- Fantasy selections are private until kickoff. Owners and administrators can
-- still read them before the deadline; everyone can read them after kickoff so
-- finalized standings and historical team views continue to work.
drop policy if exists "fantasy squads readable" on public.fantasy_squads;
drop policy if exists "fantasy squads privacy aware" on public.fantasy_squads;
create policy "fantasy squads privacy aware"
on public.fantasy_squads
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.games game
    where game.id = fantasy_squads.game_id
      and (game.status in ('live', 'final') or now() >= game.game_date)
  )
);

drop policy if exists "fantasy picks readable" on public.fantasy_picks;
drop policy if exists "fantasy picks privacy aware" on public.fantasy_picks;
create policy "fantasy picks privacy aware"
on public.fantasy_picks
for select
to authenticated
using (
  exists (
    select 1
    from public.fantasy_squads squad
    join public.games game on game.id = squad.game_id
    where squad.id = fantasy_picks.squad_id
      and (
        squad.user_id = auth.uid()
        or public.is_admin()
        or game.status in ('live', 'final')
        or now() >= game.game_date
      )
  )
);

-- Server routes use this table through a service-role-only function. Keys are
-- SHA-256 digests, so raw IP addresses and user IDs are not stored here.
create table if not exists public.api_rate_limits (
  bucket_key text primary key check (char_length(bucket_key) = 64),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;
create index if not exists api_rate_limits_updated_idx
  on public.api_rate_limits(updated_at);
revoke all on public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  target_bucket_key text,
  maximum_attempts integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  if target_bucket_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Rate-limit key must be a SHA-256 digest';
  end if;
  if maximum_attempts < 1 or maximum_attempts > 10000 then
    raise exception 'Invalid rate-limit maximum';
  end if;
  if window_seconds < 1 or window_seconds > 86400 then
    raise exception 'Invalid rate-limit window';
  end if;

  delete from public.api_rate_limits
  where updated_at < now() - interval '2 days';

  insert into public.api_rate_limits (
    bucket_key,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (target_bucket_key, now(), 1, now())
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when public.api_rate_limits.window_started_at
        <= now() - make_interval(secs => window_seconds)
      then now()
      else public.api_rate_limits.window_started_at
    end,
    attempt_count = case
      when public.api_rate_limits.window_started_at
        <= now() - make_interval(secs => window_seconds)
      then 1
      else public.api_rate_limits.attempt_count + 1
    end,
    updated_at = now()
  returning attempt_count into current_count;

  return current_count <= maximum_attempts;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

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

  select * into existing_slip
  from public.bet_slips
  where user_id = current_user_id and request_id = client_request_id;
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
  where id = 1;

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

  -- Serialize placement per user so the wallet and minute-rate checks cannot
  -- be raced with several concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if (
    select count(*)
    from public.bet_slips
    where user_id = current_user_id
      and placed_at > now() - interval '1 minute'
  ) >= max_bets_per_minute_value then
    raise exception 'Too many bets were placed at once. Wait a minute and try again';
  end if;

  select * into target_game
  from public.games
  where id = target_game_id
  for update;
  if not found then raise exception 'Game not found'; end if;
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
  join public.betting_outcomes outcome on outcome.id = picked.outcome_id
  join public.betting_markets market on market.id = outcome.market_id
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

  -- Builders retain the conservative reserve until a joint match simulator is
  -- validated. Accepted prices are immutable after this calculation.
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
  where user_id = current_user_id and season_id = target_game.season_id
  for update;
  if target_wallet.balance_units < stake_units then raise exception 'Not enough coins'; end if;

  insert into public.bet_slips (
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
    join public.betting_outcomes outcome on outcome.id = picked.outcome_id
    join public.betting_markets market on market.id = outcome.market_id
  loop
    insert into public.bet_legs (
      slip_id,
      market_id,
      outcome_id,
      accepted_odds,
      fair_probability
    )
    values (
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
  returning balance_units into target_wallet.balance_units;

  insert into public.coin_ledger (
    wallet_id,
    slip_id,
    entry_type,
    amount_units,
    balance_after_units,
    idempotency_key,
    metadata
  )
  values (
    target_wallet.id,
    created_slip_id,
    'stake',
    -stake_units,
    target_wallet.balance_units,
    'stake:' || created_slip_id::text,
    jsonb_build_object(
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

revoke all on function public.place_bet(uuid, uuid[], numeric, uuid) from public, anon;
grant execute on function public.place_bet(uuid, uuid[], numeric, uuid) to authenticated;

-- The removed social endpoint must remain inaccessible even if an older grant
-- was applied manually.
revoke all on function public.get_public_bet_slips(uuid) from public, anon, authenticated;
