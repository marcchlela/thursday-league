-- Expanded betting controls and privacy-aware league sharing.
-- Multiple lines for one market family may exist, but a slip may contain only
-- one of them so correlated alternate lines cannot inflate builder odds.

create or replace function public.guard_bet_leg_market_family()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_market public.betting_markets%rowtype;
begin
  select * into new_market from public.betting_markets where id = new.market_id;
  if not found then raise exception 'Betting market not found'; end if;

  if exists (
    select 1
    from public.bet_legs existing_leg
    join public.betting_markets existing_market on existing_market.id = existing_leg.market_id
    where existing_leg.slip_id = new.slip_id
      and existing_leg.id is distinct from new.id
      and existing_market.market_type = new_market.market_type
      and existing_market.subject_player_id is not distinct from new_market.subject_player_id
  ) then
    raise exception 'Choose only one line from each market family';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_bet_leg_market_family on public.bet_legs;
create trigger guard_bet_leg_market_family
before insert or update of market_id, slip_id on public.bet_legs
for each row execute function public.guard_bet_leg_market_family();

create or replace function public.admin_prepare_betting_edit(target_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_game public.games%rowtype;
  lock_minutes_value integer;
  before_data jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into target_game from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if not exists (select 1 from public.betting_markets where game_id = target_game_id) then raise exception 'No markets to edit'; end if;
  if exists (select 1 from public.bet_slips where game_id = target_game_id) then
    raise exception 'Accepted bets make the published markets immutable. Suspend them instead.';
  end if;
  if exists (select 1 from public.betting_markets where game_id = target_game_id and invalidated) then
    raise exception 'These markets were invalidated by a game or lineup change. Delete and regenerate them instead.';
  end if;
  select lock_minutes into lock_minutes_value from public.betting_settings where id = 1;
  if target_game.status not in ('upcoming', 'draft') or now() >= target_game.game_date - make_interval(mins => lock_minutes_value) then
    raise exception 'Markets cannot be edited after betting locks';
  end if;

  select jsonb_build_object('statuses', jsonb_agg(distinct status), 'market_count', count(*))
  into before_data from public.betting_markets where game_id = target_game_id;
  update public.betting_markets
  set status = 'draft', updated_at = now()
  where game_id = target_game_id and status in ('draft', 'open', 'suspended');

  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (auth.uid(), target_game_id, 'betting_markets_edit_started', before_data, jsonb_build_object('status', 'draft'));
end;
$$;

create or replace function public.admin_delete_betting_markets(target_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_data jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  perform 1 from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if exists (select 1 from public.bet_slips where game_id = target_game_id) then
    raise exception 'Markets with accepted bets cannot be deleted. Suspend them instead.';
  end if;
  if not exists (select 1 from public.betting_markets where game_id = target_game_id) then raise exception 'No markets to delete'; end if;

  select jsonb_build_object(
    'market_count', count(*),
    'statuses', jsonb_agg(distinct status),
    'generation_run_ids', jsonb_agg(distinct generation_run_id)
  ) into before_data
  from public.betting_markets where game_id = target_game_id;

  delete from public.odds_generation_runs where game_id = target_game_id;
  insert into public.admin_audit_log(admin_user_id, game_id, action, before_data, after_data)
  values (auth.uid(), target_game_id, 'betting_markets_deleted', before_data, jsonb_build_object('market_count', 0));
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
      count(*)::bigint as total_bets,
      count(*) filter (where slip.status <> 'pending')::bigint as settled_bets,
      count(*) filter (where slip.status = 'won')::bigint as won_bets,
      coalesce(sum(coalesce(slip.settled_payout_units, 0) - slip.stake_units) filter (where slip.status <> 'pending'), 0)::bigint as settled_profit_units
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
declare
  lock_minutes_value integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.games where id = target_game_id) then raise exception 'Game not found'; end if;
  select lock_minutes into lock_minutes_value from public.betting_settings where id = 1;

  return query
  select
    slip.id,
    slip.user_id,
    profile.username,
    slip.game_id,
    slip.slip_type,
    slip.stake_units,
    slip.accepted_odds,
    slip.potential_payout_units,
    slip.settled_payout_units,
    slip.status,
    slip.placed_at,
    reveal.picks_revealed,
    case when reveal.picks_revealed then coalesce(detail.legs, '[]'::jsonb) else '[]'::jsonb end
  from public.bet_slips slip
  join public.profiles profile on profile.id = slip.user_id
  join public.games game on game.id = slip.game_id
  cross join lateral (
    select (slip.user_id = auth.uid() or now() >= game.game_date - make_interval(mins => lock_minutes_value) or game.status in ('live', 'final')) as picks_revealed
  ) reveal
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
  order by slip.placed_at desc;
end;
$$;

revoke all on function public.guard_bet_leg_market_family() from public;
revoke all on function public.admin_prepare_betting_edit(uuid) from public;
revoke all on function public.admin_delete_betting_markets(uuid) from public;
revoke all on function public.get_betting_standings(uuid) from public;
revoke all on function public.get_public_bet_slips(uuid) from public;

grant execute on function public.admin_prepare_betting_edit(uuid) to authenticated;
grant execute on function public.admin_delete_betting_markets(uuid) to authenticated;
grant execute on function public.get_betting_standings(uuid) to authenticated;
grant execute on function public.get_public_bet_slips(uuid) to authenticated;
