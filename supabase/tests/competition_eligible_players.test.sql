begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.test', '{"username":"admin"}'),
  ('00000000-0000-4000-8000-000000000002', 'member@example.test', '{"username":"member"}');

insert into public.players(id, name, default_position) values
  ('10000000-0000-4000-8000-000000000001', 'Anonymous', 'outfield'),
  ('10000000-0000-4000-8000-000000000002', 'Player 2', 'goalkeeper'),
  ('10000000-0000-4000-8000-000000000003', 'Player 3', 'outfield'),
  ('10000000-0000-4000-8000-000000000004', 'Player 4', 'outfield'),
  ('10000000-0000-4000-8000-000000000005', 'Player 5', 'outfield'),
  ('10000000-0000-4000-8000-000000000006', 'Player 6', 'goalkeeper'),
  ('10000000-0000-4000-8000-000000000007', 'Player 7', 'outfield'),
  ('10000000-0000-4000-8000-000000000008', 'Player 8', 'outfield'),
  ('10000000-0000-4000-8000-000000000009', 'Player 9', 'outfield'),
  ('10000000-0000-4000-8000-000000000010', 'Player 10', 'outfield');

insert into public.games(id, game_date, status)
values ('20000000-0000-4000-8000-000000000001', now() + interval '1 day', 'draft');

insert into public.game_lineups(game_id, player_id, team, role, slot_index) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'A', 'goalkeeper', 0),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'A', 'outfield', 1),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'A', 'outfield', 2),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'A', 'outfield', 3),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'A', 'outfield', 4),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'B', 'goalkeeper', 0),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', 'B', 'outfield', 1),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000008', 'B', 'outfield', 2),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009', 'B', 'outfield', 3),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', 'B', 'outfield', 4);

insert into public.odds_generation_runs(id, game_id, model_version)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'test');
insert into public.betting_markets(id, game_id, generation_run_id, market_key, market_type, title, subject_player_id, line, status)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'anonymous-goals-0.5', 'player_goals', 'Anonymous goals',
  '10000000-0000-4000-8000-000000000001', 0.5, 'open'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select public.admin_set_player_competition_eligibility('10000000-0000-4000-8000-000000000001', false);

do $$
begin
  if (select competition_eligible from public.players where id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'Guest eligibility was not disabled';
  end if;
  if not exists (
    select 1 from public.betting_markets
    where id = '40000000-0000-4000-8000-000000000001'
      and invalidated and status = 'suspended'
  ) then raise exception 'Upcoming guest markets were not invalidated'; end if;
  if not exists (
    select 1 from public.admin_audit_log
    where action = 'player_competition_eligibility_changed'
  ) then raise exception 'Eligibility change was not audited'; end if;
end;
$$;

do $$
begin
  begin
    insert into public.betting_markets(game_id, generation_run_id, market_key, market_type, title, subject_player_id, line)
    values (
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'anonymous-assists-0.5', 'player_assists', 'Anonymous assists',
      '10000000-0000-4000-8000-000000000001', 0.5
    );
    raise exception 'Expected guest individual market rejection';
  exception when others then
    if sqlerrm = 'Expected guest individual market rejection' then raise; end if;
    if position('Individual betting markets cannot use guest players' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.save_fantasy_squad(
      '20000000-0000-4000-8000-000000000001',
      '[
        {"player_id":"10000000-0000-4000-8000-000000000001","role":"outfield","is_captain":true,"slot_index":0},
        {"player_id":"10000000-0000-4000-8000-000000000003","role":"outfield","is_captain":false,"slot_index":1},
        {"player_id":"10000000-0000-4000-8000-000000000004","role":"outfield","is_captain":false,"slot_index":2},
        {"player_id":"10000000-0000-4000-8000-000000000005","role":"outfield","is_captain":false,"slot_index":3},
        {"player_id":"10000000-0000-4000-8000-000000000002","role":"goalkeeper","is_captain":false,"slot_index":4}
      ]'::jsonb
    );
    raise exception 'Expected guest fantasy rejection';
  exception when others then
    if sqlerrm = 'Expected guest fantasy rejection' then raise; end if;
    if position('eligible player' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

select public.save_fantasy_squad(
  '20000000-0000-4000-8000-000000000001',
  '[
    {"player_id":"10000000-0000-4000-8000-000000000003","role":"outfield","is_captain":true,"slot_index":0},
    {"player_id":"10000000-0000-4000-8000-000000000004","role":"outfield","is_captain":false,"slot_index":1},
    {"player_id":"10000000-0000-4000-8000-000000000005","role":"outfield","is_captain":false,"slot_index":2},
    {"player_id":"10000000-0000-4000-8000-000000000007","role":"outfield","is_captain":false,"slot_index":3},
    {"player_id":"10000000-0000-4000-8000-000000000002","role":"goalkeeper","is_captain":false,"slot_index":4}
  ]'::jsonb
);

insert into public.game_result_versions(
  id, game_id, version_number, score_a, score_b, own_goal_count, player_totals
) values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  1, 3, 2, 0,
  '{"10000000-0000-4000-8000-000000000001":{"team":"A","role":"outfield","goals":2,"assists":0,"saves":0,"own_goals":0}}'
);

do $$
declare target_result public.game_result_versions%rowtype;
begin
  select * into target_result from public.game_result_versions where id = '50000000-0000-4000-8000-000000000001';
  if public.evaluate_bet_leg('player_goals', 'over', 0.5, '10000000-0000-4000-8000-000000000001', target_result) <> 'void' then
    raise exception 'Guest player bet was not voided';
  end if;
  if public.evaluate_bet_leg('total_goals', 'over', 3.5, null, target_result) <> 'won' then
    raise exception 'Guest goals were incorrectly removed from the real match total';
  end if;
end;
$$;

rollback;
