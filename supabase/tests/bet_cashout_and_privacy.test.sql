begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('70000000-0000-4000-8000-000000000001', 'cashout-admin@example.test', '{"username":"cashout_admin"}'),
  ('70000000-0000-4000-8000-000000000002', 'bettor-one@example.test', '{"username":"bettor_one"}'),
  ('70000000-0000-4000-8000-000000000003', 'bettor-two@example.test', '{"username":"bettor_two"}');

insert into public.players(id, name, default_position) values
  ('71000000-0000-4000-8000-000000000001', 'Cashout Player 1', 'goalkeeper'),
  ('71000000-0000-4000-8000-000000000002', 'Cashout Player 2', 'outfield'),
  ('71000000-0000-4000-8000-000000000003', 'Cashout Player 3', 'outfield'),
  ('71000000-0000-4000-8000-000000000004', 'Cashout Player 4', 'outfield'),
  ('71000000-0000-4000-8000-000000000005', 'Cashout Player 5', 'outfield'),
  ('71000000-0000-4000-8000-000000000006', 'Cashout Player 6', 'goalkeeper'),
  ('71000000-0000-4000-8000-000000000007', 'Cashout Player 7', 'outfield'),
  ('71000000-0000-4000-8000-000000000008', 'Cashout Player 8', 'outfield'),
  ('71000000-0000-4000-8000-000000000009', 'Cashout Player 9', 'outfield'),
  ('71000000-0000-4000-8000-000000000010', 'Cashout Player 10', 'outfield');

insert into public.games(id, game_date, status)
values ('72000000-0000-4000-8000-000000000001', now() + interval '1 day', 'draft');

insert into public.game_lineups(game_id, player_id, team, role, slot_index)
select
  '72000000-0000-4000-8000-000000000001',
  player.id,
  case when row_number() over (order by player.id) <= 5 then 'A'::public.team_code else 'B'::public.team_code end,
  player.default_position,
  ((row_number() over (order by player.id) - 1) % 5)::integer
from public.players player
where player.id::text like '71000000-%';

insert into public.odds_generation_runs(id, game_id, model_version)
values ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'cashout-test');
insert into public.betting_markets(id, game_id, generation_run_id, market_key, market_type, title, status)
values ('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', 'match-result', 'match_result', 'Match result', 'open');
insert into public.betting_outcomes(id, market_id, outcome_key, label, fair_probability, offered_odds) values
  ('75000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001', 'A', 'Team A', 0.50, 1.80),
  ('75000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000001', 'B', 'Team B', 0.50, 1.80);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);
select public.place_bet(
  '72000000-0000-4000-8000-000000000001',
  array['75000000-0000-4000-8000-000000000001']::uuid[],
  10,
  '76000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000003', true);
select public.place_bet('72000000-0000-4000-8000-000000000001', array['75000000-0000-4000-8000-000000000001']::uuid[], 5, '76000000-0000-4000-8000-000000000002');
select public.place_bet('72000000-0000-4000-8000-000000000001', array['75000000-0000-4000-8000-000000000002']::uuid[], 5, '76000000-0000-4000-8000-000000000003');

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);
do $$
declare visible_rows integer; hidden_rows integer;
begin
  select count(*) into visible_rows from public.get_public_bet_slips('72000000-0000-4000-8000-000000000001');
  select count(*) into hidden_rows
  from public.get_public_bet_slips('72000000-0000-4000-8000-000000000001')
  where user_id = '70000000-0000-4000-8000-000000000003'
    and not picks_revealed
    and status = 'hidden'
    and stake_units = 0
    and accepted_odds = 0
    and legs = '[]'::jsonb;
  if visible_rows <> 2 or hidden_rows <> 1 then
    raise exception 'Pre-final social privacy did not collapse other slips to a username-only row';
  end if;
end;
$$;

select public.cash_out_bet((select id from public.bet_slips where request_id = '76000000-0000-4000-8000-000000000001'));
select public.cash_out_bet((select id from public.bet_slips where request_id = '76000000-0000-4000-8000-000000000001'));

do $$
begin
  if not exists (
    select 1 from public.bet_slips
    where request_id = '76000000-0000-4000-8000-000000000001'
      and status = 'cashed_out' and settled_payout_units = stake_units
  ) then raise exception 'Cash-out did not preserve the refunded slip'; end if;
  if (
    select balance_units
    from public.betting_wallets
    where user_id = '70000000-0000-4000-8000-000000000002'
      and season_id = (select season_id from public.games where id = '72000000-0000-4000-8000-000000000001')
  ) <> 10000 then
    raise exception 'Cash-out did not return the full stake';
  end if;
  if (select count(*) from public.coin_ledger where entry_type = 'cashout' and slip_id = (select id from public.bet_slips where request_id = '76000000-0000-4000-8000-000000000001')) <> 1 then
    raise exception 'Repeated cash-out was not idempotent';
  end if;
end;
$$;

insert into public.game_result_versions(id, game_id, version_number, score_a, score_b, own_goal_count)
values ('77000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 1, 1, 0, 0);
select public.settle_game_bets('72000000-0000-4000-8000-000000000001', '77000000-0000-4000-8000-000000000001');

select set_config('app.allow_final_transition', 'true', true);
select set_config('app.suppress_generic_audit', 'true', true);
update public.games set status = 'final', finalized_at = now() where id = '72000000-0000-4000-8000-000000000001';

do $$
begin
  if (select status from public.bet_slips where request_id = '76000000-0000-4000-8000-000000000001') <> 'cashed_out' then
    raise exception 'Settlement changed a cashed-out slip';
  end if;
  if (select slips_processed from public.bet_settlement_runs where result_version_id = '77000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'Settlement processed the cashed-out slip';
  end if;
  if (select count(*) from public.get_public_bet_slips('72000000-0000-4000-8000-000000000001') where user_id = '70000000-0000-4000-8000-000000000003' and picks_revealed and jsonb_array_length(legs) = 1) <> 2 then
    raise exception 'Other users'' selections were not revealed after the final result';
  end if;
  if exists (select 1 from public.get_public_bet_slips('72000000-0000-4000-8000-000000000001') where user_id = '70000000-0000-4000-8000-000000000002') then
    raise exception 'Cashed-out slips should not appear in league picks';
  end if;
end;
$$;

rollback;
