-- Full-stake virtual-coin cash-out is available until scheduled kickoff.
-- Other users' bet details remain server-private until the game is final.

alter table public.bet_slips drop constraint if exists bet_slips_status_check;
alter table public.bet_slips add constraint bet_slips_status_check
  check (status in ('pending', 'won', 'lost', 'void', 'cashed_out'));

alter table public.coin_ledger drop constraint if exists coin_ledger_entry_type_check;
alter table public.coin_ledger add constraint coin_ledger_entry_type_check
  check (entry_type in ('initial_grant', 'stake', 'cashout', 'payout', 'settlement_correction'));

create or replace function public.cash_out_bet(target_slip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_slip public.bet_slips%rowtype;
  target_game public.games%rowtype;
  target_wallet public.betting_wallets%rowtype;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;

  select * into target_slip from public.bet_slips where id = target_slip_id;
  if not found or target_slip.user_id <> current_user_id then raise exception 'Bet slip not found'; end if;
  if target_slip.status = 'cashed_out' then
    return jsonb_build_object(
      'slip_id', target_slip.id,
      'refund_units', target_slip.stake_units,
      'balance_units', (select balance_units from public.betting_wallets where id = target_slip.wallet_id)
    );
  end if;

  -- Lock the game before the slip, matching the finalization lock order so a
  -- cash-out and game settlement cannot race each other.
  select * into target_game from public.games where id = target_slip.game_id for update;
  if not found then raise exception 'Game not found'; end if;
  select * into target_slip from public.bet_slips where id = target_slip_id for update;

  if target_slip.status = 'cashed_out' then
    return jsonb_build_object(
      'slip_id', target_slip.id,
      'refund_units', target_slip.stake_units,
      'balance_units', (select balance_units from public.betting_wallets where id = target_slip.wallet_id)
    );
  end if;
  if target_slip.status <> 'pending' then raise exception 'Only pending bets can be cashed out'; end if;
  if target_game.status not in ('upcoming', 'draft') or now() >= target_game.game_date then
    raise exception 'Cash-out closes at scheduled kickoff';
  end if;

  select * into target_wallet from public.betting_wallets where id = target_slip.wallet_id for update;
  update public.betting_wallets
  set balance_units = balance_units + target_slip.stake_units, updated_at = now()
  where id = target_wallet.id
  returning balance_units into target_wallet.balance_units;

  update public.bet_legs set status = 'void', result_value = null where slip_id = target_slip.id;
  update public.bet_slips
  set status = 'cashed_out',
      settled_payout_units = stake_units,
      settled_at = now(),
      result_version_id = null
  where id = target_slip.id;

  insert into public.coin_ledger(
    wallet_id, slip_id, entry_type, amount_units, balance_after_units, idempotency_key, metadata
  ) values (
    target_wallet.id,
    target_slip.id,
    'cashout',
    target_slip.stake_units,
    target_wallet.balance_units,
    'cashout:' || target_slip.id::text,
    jsonb_build_object('game_id', target_slip.game_id, 'refund', 'full_stake', 'cashout_at', now())
  );

  return jsonb_build_object(
    'slip_id', target_slip.id,
    'refund_units', target_slip.stake_units,
    'balance_units', target_wallet.balance_units
  );
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

  for target_slip in
    select * from public.bet_slips
    where game_id = target_game_id and status <> 'cashed_out'
    order by placed_at for update
  loop
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
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.seasons where id = target_season_id) then raise exception 'Season not found'; end if;
  return query
  select
    profile.id,
    profile.username,
    coalesce(wallet.balance_units, settings.starting_balance_units)::bigint,
    coalesce(summary.settled_profit_units, 0)::bigint,
    coalesce(summary.total_bets, 0)::bigint,
    coalesce(summary.settled_bets, 0)::bigint,
    coalesce(summary.won_bets, 0)::bigint
  from public.profiles profile
  cross join public.betting_settings settings
  left join public.betting_wallets wallet on wallet.user_id = profile.id and wallet.season_id = target_season_id
  left join lateral (
    select
      count(*) filter (where slip.status <> 'cashed_out')::bigint as total_bets,
      count(*) filter (where slip.status in ('won', 'lost', 'void'))::bigint as settled_bets,
      count(*) filter (where slip.status = 'won')::bigint as won_bets,
      coalesce(sum(coalesce(slip.settled_payout_units, 0) - slip.stake_units) filter (where slip.status in ('won', 'lost', 'void')), 0)::bigint as settled_profit_units
    from public.bet_slips slip
    where slip.user_id = profile.id and slip.season_id = target_season_id
  ) summary on true
  order by coalesce(summary.settled_profit_units, 0) desc, coalesce(wallet.balance_units, settings.starting_balance_units) desc, profile.username;
end;
$$;

create or replace function public.get_public_bet_slips(target_game_id uuid)
returns table (
  slip_id uuid,
  user_id uuid,
  username text,
  game_id uuid,
  slip_type text,
  stake_units bigint,
  accepted_odds numeric,
  potential_payout_units bigint,
  settled_payout_units bigint,
  status text,
  placed_at timestamptz,
  picks_revealed boolean,
  legs jsonb
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.games where id = target_game_id) then raise exception 'Game not found'; end if;

  return query
  with game_state as (
    select game.status from public.games game where game.id = target_game_id
  ), shared as (
    select
      slip.id as slip_id,
      slip.user_id,
      profile.username,
      slip.game_id,
      slip.slip_type::text,
      slip.stake_units,
      slip.accepted_odds,
      slip.potential_payout_units,
      slip.settled_payout_units,
      slip.status::text,
      slip.placed_at,
      true as picks_revealed,
      coalesce(detail.legs, '[]'::jsonb) as legs
    from public.bet_slips slip
    join public.profiles profile on profile.id = slip.user_id
    cross join game_state
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'market_title', market.title,
        'market_type', market.market_type,
        'line', market.line,
        'outcome_label', outcome.label,
        'accepted_odds', leg.accepted_odds,
        'status', leg.status
      ) order by leg.created_at) as legs
      from public.bet_legs leg
      join public.betting_markets market on market.id = leg.market_id
      join public.betting_outcomes outcome on outcome.id = leg.outcome_id
      where leg.slip_id = slip.id
    ) detail on true
    where slip.game_id = target_game_id
      and slip.status <> 'cashed_out'
      and (slip.user_id = auth.uid() or game_state.status = 'final')

    union all

    select
      profile.id as slip_id,
      profile.id as user_id,
      profile.username,
      target_game_id as game_id,
      'single'::text as slip_type,
      0::bigint as stake_units,
      0::numeric as accepted_odds,
      0::bigint as potential_payout_units,
      0::bigint as settled_payout_units,
      'hidden'::text as status,
      'epoch'::timestamptz as placed_at,
      false as picks_revealed,
      '[]'::jsonb as legs
    from public.profiles profile
    cross join game_state
    where game_state.status <> 'final'
      and profile.id <> auth.uid()
      and exists (
        select 1 from public.bet_slips slip
        where slip.game_id = target_game_id
          and slip.user_id = profile.id
          and slip.status <> 'cashed_out'
      )
  )
  select
    shared.slip_id,
    shared.user_id,
    shared.username,
    shared.game_id,
    shared.slip_type,
    shared.stake_units,
    shared.accepted_odds,
    shared.potential_payout_units,
    shared.settled_payout_units,
    shared.status,
    shared.placed_at,
    shared.picks_revealed,
    shared.legs
  from shared
  order by shared.picks_revealed desc, shared.placed_at desc nulls last, shared.username;
end;
$$;

revoke all on function public.cash_out_bet(uuid) from public;
revoke all on function public.settle_game_bets(uuid, uuid) from public;
revoke all on function public.get_betting_standings(uuid) from public;
revoke all on function public.get_public_bet_slips(uuid) from public;
grant execute on function public.cash_out_bet(uuid) to authenticated;
grant execute on function public.get_betting_standings(uuid) to authenticated;
grant execute on function public.get_public_bet_slips(uuid) to authenticated;
