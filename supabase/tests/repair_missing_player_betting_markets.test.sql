begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'repair-admin@example.test', '{"username":"repair_admin"}'),
  ('a0000000-0000-4000-8000-000000000002', 'repair-member@example.test', '{"username":"repair_member"}');

update public.profiles
set is_admin = true
where id = 'a0000000-0000-4000-8000-000000000001';

insert into public.league_memberships(league_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'admin'),
  ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'member');

insert into public.players(
  id,
  name,
  default_position,
  player_type,
  fantasy_eligible,
  individual_betting_eligible
) values
  ('a1000000-0000-4000-8000-000000000001', 'Repair Guest', 'outfield', 'guest', false, false),
  ('a1000000-0000-4000-8000-000000000002', 'Repair Player 2', 'goalkeeper', 'regular', true, true),
  ('a1000000-0000-4000-8000-000000000003', 'Repair Player 3', 'outfield', 'regular', true, true),
  ('a1000000-0000-4000-8000-000000000004', 'Repair Player 4', 'outfield', 'regular', true, true),
  ('a1000000-0000-4000-8000-000000000005', 'Repair Player 5', 'outfield', 'regular', true, true),
  ('a1000000-0000-4000-8000-000000000006', 'Repair Player 6', 'goalkeeper', 'regular', true, true),
  ('a1000000-0000-4000-8000-000000000007', 'Repair Player 7', 'outfield', 'regular', true, true),
  ('a1000000-0000-4000-8000-000000000008', 'Repair Player 8', 'outfield', 'regular', true, true),
  ('a1000000-0000-4000-8000-000000000009', 'Repair Player 9', 'outfield', 'regular', true, true),
  ('a1000000-0000-4000-8000-000000000010', 'Repair Player 10', 'outfield', 'regular', true, true);

insert into public.games(id, game_date, status)
values ('a2000000-0000-4000-8000-000000000001', now() + interval '1 day', 'upcoming');

insert into public.game_lineups(game_id, player_id, team, role, slot_index) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'A', 'goalkeeper', 0),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'A', 'outfield', 1),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'A', 'outfield', 2),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'A', 'outfield', 3),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'A', 'outfield', 4),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'B', 'goalkeeper', 0),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000007', 'B', 'outfield', 1),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000008', 'B', 'outfield', 2),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000009', 'B', 'outfield', 3),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000010', 'B', 'outfield', 4);

insert into public.odds_generation_runs(id, game_id, model_version, input_snapshot)
values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'repair-test',
  '{
    "team_A": [
      {"player_id":"a1000000-0000-4000-8000-000000000002","role":"goalkeeper","player_type":"regular","model_eligible":true},
      {"player_id":"a1000000-0000-4000-8000-000000000001","role":"outfield","player_type":"guest","model_eligible":false},
      {"player_id":"a1000000-0000-4000-8000-000000000003","role":"outfield","player_type":"regular","model_eligible":true},
      {"player_id":"a1000000-0000-4000-8000-000000000004","role":"outfield","player_type":"regular","model_eligible":true},
      {"player_id":"a1000000-0000-4000-8000-000000000005","role":"outfield","player_type":"regular","model_eligible":true}
    ],
    "team_B": [
      {"player_id":"a1000000-0000-4000-8000-000000000006","role":"goalkeeper","player_type":"regular","model_eligible":true},
      {"player_id":"a1000000-0000-4000-8000-000000000007","role":"outfield","player_type":"regular","model_eligible":true},
      {"player_id":"a1000000-0000-4000-8000-000000000008","role":"outfield","player_type":"regular","model_eligible":true},
      {"player_id":"a1000000-0000-4000-8000-000000000009","role":"outfield","player_type":"regular","model_eligible":true},
      {"player_id":"a1000000-0000-4000-8000-000000000010","role":"outfield","player_type":"regular","model_eligible":true}
    ]
  }'::jsonb
);

insert into public.betting_markets(
  id,
  game_id,
  generation_run_id,
  market_key,
  market_type,
  title,
  status
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'match-result',
  'match_result',
  'Match result',
  'open'
);

insert into public.betting_outcomes(
  id,
  market_id,
  outcome_key,
  label,
  fair_probability,
  offered_odds
) values
  ('a5000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'A', 'Team A', 0.4, 2.25),
  ('a5000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'draw', 'Draw', 0.2, 4.5),
  ('a5000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001', 'B', 'Team B', 0.4, 2.25);

do $$
declare
  target_wallet_id uuid;
  target_season_id uuid;
begin
  select game.season_id into target_season_id
  from public.games game
  where game.id = 'a2000000-0000-4000-8000-000000000001';

  select wallet.id into target_wallet_id
  from public.betting_wallets wallet
  where wallet.user_id = 'a0000000-0000-4000-8000-000000000002'
    and wallet.season_id = target_season_id;

  insert into public.bet_slips(
    id,
    user_id,
    wallet_id,
    game_id,
    season_id,
    slip_type,
    stake_units,
    accepted_odds,
    potential_payout_units,
    request_id
  ) values (
    'a6000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    target_wallet_id,
    'a2000000-0000-4000-8000-000000000001',
    target_season_id,
    'single',
    100,
    2.25,
    225,
    'a7000000-0000-4000-8000-000000000001'
  );

  insert into public.bet_legs(
    slip_id,
    market_id,
    outcome_id,
    accepted_odds,
    fair_probability
  ) values (
    'a6000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    2.25,
    0.4
  );
end;
$$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select public.admin_update_player_settings(
  'a1000000-0000-4000-8000-000000000001',
  'Repair Guest',
  'outfield',
  true,
  'guest',
  true,
  true
);

do $$
begin
  if not exists (
    select 1
    from public.betting_markets
    where id = 'a4000000-0000-4000-8000-000000000001'
      and status = 'suspended'
      and invalidated
  ) then raise exception 'Eligibility change did not suspend the existing market set'; end if;
end;
$$;

select public.admin_repair_missing_player_markets(
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'repair-test',
  '{}'::jsonb,
  '[
    {
      "market_key":"player-goals-a1000000-0000-4000-8000-000000000001-0.5",
      "market_type":"player_goals",
      "title":"Repair Guest goals",
      "subject_player_id":"a1000000-0000-4000-8000-000000000001",
      "line":0.5,
      "outcomes":[
        {"outcome_key":"over","label":"Over 0.5","fair_probability":0.4,"offered_odds":2.35},
        {"outcome_key":"under","label":"Under 0.5","fair_probability":0.6,"offered_odds":1.57}
      ]
    },
    {
      "market_key":"player-goals-a1000000-0000-4000-8000-000000000001-1.5",
      "market_type":"player_goals",
      "title":"Repair Guest goals",
      "subject_player_id":"a1000000-0000-4000-8000-000000000001",
      "line":1.5,
      "outcomes":[
        {"outcome_key":"over","label":"Over 1.5","fair_probability":0.2,"offered_odds":4.7},
        {"outcome_key":"under","label":"Under 1.5","fair_probability":0.8,"offered_odds":1.18}
      ]
    },
    {
      "market_key":"player-assists-a1000000-0000-4000-8000-000000000001-0.5",
      "market_type":"player_assists",
      "title":"Repair Guest assists",
      "subject_player_id":"a1000000-0000-4000-8000-000000000001",
      "line":0.5,
      "outcomes":[
        {"outcome_key":"over","label":"Over 0.5","fair_probability":0.3,"offered_odds":3.14},
        {"outcome_key":"under","label":"Under 0.5","fair_probability":0.7,"offered_odds":1.35}
      ]
    }
  ]'::jsonb
);

do $$
begin
  if (select offered_odds from public.betting_outcomes where id = 'a5000000-0000-4000-8000-000000000001') <> 2.25 then
    raise exception 'An existing offered price changed during repair';
  end if;
  if (select accepted_odds from public.bet_legs where slip_id = 'a6000000-0000-4000-8000-000000000001') <> 2.25 then
    raise exception 'An accepted leg price changed during repair';
  end if;
  if (select accepted_odds from public.bet_slips where id = 'a6000000-0000-4000-8000-000000000001') <> 2.25 then
    raise exception 'An accepted slip price changed during repair';
  end if;
  if (
    select count(*)
    from public.betting_markets
    where game_id = 'a2000000-0000-4000-8000-000000000001'
      and subject_player_id = 'a1000000-0000-4000-8000-000000000001'
  ) <> 3 then raise exception 'The complete missing market families were not appended'; end if;
  if exists (
    select 1
    from public.betting_markets
    where game_id = 'a2000000-0000-4000-8000-000000000001'
      and (status <> 'suspended' or invalidated)
  ) then raise exception 'The repaired set should be valid but remain suspended for review'; end if;
  if not exists (
    select 1
    from public.admin_audit_log
    where game_id = 'a2000000-0000-4000-8000-000000000001'
      and action = 'betting_missing_player_markets_repaired'
      and after_data ->> 'existing_odds_changed' = 'false'
      and after_data ->> 'accepted_slips_changed' = 'false'
  ) then raise exception 'The repair was not audited'; end if;
end;
$$;

select public.admin_set_betting_status(
  'a2000000-0000-4000-8000-000000000001',
  'open'
);

do $$
begin
  if (
    select count(*)
    from public.betting_markets
    where game_id = 'a2000000-0000-4000-8000-000000000001'
      and status = 'open'
  ) <> 4 then raise exception 'The complete repaired set could not be reopened'; end if;
  if not exists (
    select 1
    from public.bet_slips
    where id = 'a6000000-0000-4000-8000-000000000001'
      and accepted_odds = 2.25
  ) then raise exception 'The accepted slip was not preserved after reopening'; end if;
end;
$$;

rollback;
