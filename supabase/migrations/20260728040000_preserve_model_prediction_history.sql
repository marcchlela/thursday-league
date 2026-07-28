-- Preserve every generated model input snapshot even when an admin deletes
-- replaceable betting markets. These rows are the pre-kickoff audit trail used
-- for honest prediction-versus-result evaluation.

create index if not exists odds_generation_runs_game_created_idx
  on public.odds_generation_runs(game_id, created_at desc);

create or replace function public.admin_delete_betting_markets(target_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_data jsonb;
  preserved_generation_count bigint;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  perform 1 from public.games where id = target_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if exists (
    select 1 from public.bet_slips slip where slip.game_id = target_game_id
  ) then
    raise exception 'Markets with accepted bets cannot be deleted. Suspend them instead.';
  end if;
  if not exists (
    select 1 from public.betting_markets market where market.game_id = target_game_id
  ) then
    raise exception 'No markets to delete';
  end if;

  select jsonb_build_object(
    'market_count', count(*),
    'statuses', jsonb_agg(distinct status),
    'generation_run_ids', jsonb_agg(distinct generation_run_id)
  ) into before_data
  from public.betting_markets market
  where market.game_id = target_game_id;

  delete from public.betting_markets
  where betting_markets.game_id = target_game_id;

  select count(*) into preserved_generation_count
  from public.odds_generation_runs run
  where run.game_id = target_game_id;

  insert into public.admin_audit_log(
    admin_user_id,
    game_id,
    action,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    target_game_id,
    'betting_markets_deleted',
    before_data,
    jsonb_build_object(
      'market_count', 0,
      'preserved_generation_count', preserved_generation_count
    )
  );
end;
$$;

revoke all on function public.admin_delete_betting_markets(uuid) from public;
grant execute on function public.admin_delete_betting_markets(uuid) to authenticated;

comment on function public.admin_delete_betting_markets(uuid) is
  'Deletes replaceable betting markets without deleting immutable pre-kickoff model generation history.';
