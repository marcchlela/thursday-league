begin;

do $$
begin
  if exists (
    select 1
    from (
      values
        ('public.admin_generate_betting_markets(uuid,text,jsonb,jsonb)'),
        ('public.admin_set_betting_status(uuid,text)'),
        ('public.admin_update_betting_odds(uuid,numeric)'),
        ('public.admin_repair_missing_player_markets(uuid,uuid,text,jsonb,jsonb)'),
        ('public.admin_adjust_betting_wallet(uuid,uuid,bigint,text,uuid)'),
        ('public.system_generate_league_betting_markets(uuid,uuid,text,jsonb,jsonb)')
    ) restricted(signature)
    where has_function_privilege(
      'authenticated',
      restricted.signature,
      'EXECUTE'
    )
  ) then
    raise exception 'League users can execute a platform-only betting control';
  end if;
end;
$$;

insert into auth.users(id, email, raw_user_meta_data) values
  ('b0000000-0000-4000-8000-000000000001', 'league-a-admin@example.test', '{"username":"league_a_admin"}'),
  ('b0000000-0000-4000-8000-000000000002', 'league-a-member@example.test', '{"username":"league_a_member"}'),
  ('b0000000-0000-4000-8000-000000000003', 'league-b-admin@example.test', '{"username":"league_b_admin"}'),
  ('b0000000-0000-4000-8000-000000000004', 'league-outsider@example.test', '{"username":"league_outsider"}'),
  ('b0000000-0000-4000-8000-000000000005', 'league-invitee@example.test', '{"username":"league_invitee"}');

insert into public.leagues(
  id,
  name,
  slug,
  join_code,
  fantasy_enabled,
  betting_enabled,
  betting_unlock_after_games,
  created_by
) values
  (
    'b1000000-0000-4000-8000-000000000001',
    'Isolation League A',
    'isolation-league-a',
    'TL-AAAA-2222',
    true,
    true,
    0,
    'b0000000-0000-4000-8000-000000000001'
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'Isolation League B',
    'isolation-league-b',
    'TL-BBBB-3333',
    true,
    true,
    0,
    'b0000000-0000-4000-8000-000000000003'
  );

insert into public.league_memberships(league_id, user_id, role) values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'owner'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'member'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'owner');

insert into public.seasons(id, league_id, name, format, start_date, end_date) values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'League A season', 'custom', '2042-01-01', '2042-12-31'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'League B season', 'custom', '2042-01-01', '2042-12-31');

insert into public.league_settings(league_id, season_mode, current_season_id) values
  ('b1000000-0000-4000-8000-000000000001', 'custom', 'b2000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000002', 'custom', 'b2000000-0000-4000-8000-000000000002');

insert into public.betting_settings(league_id) values
  ('b1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000002');

insert into public.players(id, league_id, name, default_position) values
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'League A Player', 'outfield'),
  ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'League B Player', 'outfield');

insert into public.games(id, league_id, season_id, game_date, status) values
  ('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', now() + interval '2 days', 'draft'),
  ('b4000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', now() + interval '2 days', 'draft');

insert into public.fantasy_squads(id, league_id, user_id, game_id) values
  ('b5000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000002');

insert into public.fantasy_picks(id, league_id, squad_id, player_id, role, is_captain, slot_index) values
  ('b6000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'outfield', true, 0),
  ('b6000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000002', 'outfield', true, 0);

-- A composite tenant foreign key rejects a child row whose parent belongs to a
-- different league, even for a database-owner fixture session.
do $$
begin
  begin
    insert into public.game_lineups(
      league_id,
      game_id,
      player_id,
      team,
      role,
      slot_index
    ) values (
      'b1000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000002',
      'b3000000-0000-4000-8000-000000000001',
      'A',
      'outfield',
      0
    );
    raise exception 'Cross-league child row was accepted';
  exception when others then
    if sqlerrm = 'Cross-league child row was accepted' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.leagues where id::text like 'b1000000-%') <> 1 then
    raise exception 'A member can enumerate another league';
  end if;
  if exists (
    select 1 from public.players
    where id = 'b3000000-0000-4000-8000-000000000002'
  ) then raise exception 'A member can read another league roster'; end if;
  if exists (
    select 1 from public.games
    where id = 'b4000000-0000-4000-8000-000000000002'
  ) then raise exception 'A member can read another league game'; end if;
  if exists (
    select 1 from public.profiles
    where id in (
      'b0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000003',
      'b0000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000005'
    )
  ) then raise exception 'A member can read another user''s private account row'; end if;
  if (
    select count(*)
    from public.get_league_member_directory('b1000000-0000-4000-8000-000000000001')
  ) <> 2 then raise exception 'The safe league member directory is incomplete'; end if;
  if exists (
    select 1 from public.betting_settings
    where league_id = 'b1000000-0000-4000-8000-000000000001'
  ) then raise exception 'A member can read private betting configuration'; end if;
  if (
    select count(*)
    from public.get_league_betting_public_settings(
      'b1000000-0000-4000-8000-000000000001'
    )
  ) <> 1 then raise exception 'The safe betting settings view is unavailable'; end if;
  if not exists (
    select 1 from public.fantasy_squads
    where id = 'b5000000-0000-4000-8000-000000000001'
  ) then raise exception 'A member cannot read their own private Fantasy squad'; end if;
  if exists (
    select 1 from public.fantasy_squads
    where id = 'b5000000-0000-4000-8000-000000000002'
  ) then raise exception 'A member can read another league Fantasy squad'; end if;
  begin
    insert into public.players(league_id, name, default_position)
    values (
      'b1000000-0000-4000-8000-000000000001',
      'Member-created player',
      'outfield'
    );
    raise exception 'A normal member added a roster player';
  exception when others then
    if sqlerrm = 'A normal member added a roster player' then raise; end if;
  end;
  begin
    perform public.update_league_options(
      'b1000000-0000-4000-8000-000000000001',
      'Member renamed league',
      true,
      true,
      0
    );
    raise exception 'A normal member changed league settings';
  exception when others then
    if sqlerrm = 'A normal member changed league settings' then raise; end if;
    if position('League admin access required' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

reset role;

-- Owners and admins receive the minimum table grants needed for roster/game
-- administration, while RLS still enforces the target league.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into public.players(league_id, name, default_position)
values (
  'b1000000-0000-4000-8000-000000000001',
  'Owner-created player',
  'outfield'
);
insert into public.games(league_id, season_id, game_date, status)
values (
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  now() + interval '3 days',
  'upcoming'
);
reset role;
select public.set_league_member_role(
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  true
);

-- Simulate a freshly promoted admin whose profile still points at another
-- league. Auditing must use the row's league instead of this stale preference.
select set_config('request.jwt.claim.role', 'service_role', true);
insert into public.league_memberships(league_id, user_id, role) values (
  'b1000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000002',
  'member'
);
update public.profiles
set last_active_league_id = 'b1000000-0000-4000-8000-000000000002'
where id = 'b0000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into public.players(league_id, name, default_position)
values (
  'b1000000-0000-4000-8000-000000000001',
  'Admin-created player',
  'outfield'
);
insert into public.games(league_id, season_id, game_date, status)
values (
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  now() + interval '4 days',
  'upcoming'
);

-- Admins can run day-to-day operations, but owner-only controls stay closed.
do $$
begin
  begin
    perform public.set_league_member_role(
      'b1000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
      false
    );
    raise exception 'An admin changed league roles';
  exception when others then
    if sqlerrm = 'An admin changed league roles' then raise; end if;
    if position('Only the league owner' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.archive_league('b1000000-0000-4000-8000-000000000001');
    raise exception 'An admin archived the league';
  exception when others then
    if sqlerrm = 'An admin archived the league' then raise; end if;
    if position('Only the league owner' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1
    from public.admin_audit_log audit
    where audit.league_id = 'b1000000-0000-4000-8000-000000000001'
      and audit.action = 'players_insert'
      and audit.after_data ->> 'name' = 'Admin-created player'
  ) then
    raise exception 'The promoted admin write was audited under the wrong league';
  end if;
end;
$$;

-- An owner/admin role belongs to a league, not to the entire application.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.admin_update_player_settings(
      'b3000000-0000-4000-8000-000000000002',
      'Cross-tenant edit',
      'outfield',
      true,
      'regular',
      true,
      true
    );
    raise exception 'League A admin changed League B roster';
  exception when others then
    if sqlerrm = 'League A admin changed League B roster' then raise; end if;
  end;

  begin
    perform public.place_league_bet(
      'b4000000-0000-4000-8000-000000000002',
      array[]::uuid[],
      1,
      gen_random_uuid()
    );
    raise exception 'League A member accessed League B betting';
  exception when others then
    if sqlerrm = 'League A member accessed League B betting' then raise; end if;
    if position('Active league membership required' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

-- A guessed/shared code creates a pending request only.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000004', true);
select public.request_to_join_league('TL-AAAA-2222');
do $$
begin
  if exists (
    select 1 from public.league_memberships
    where league_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'b0000000-0000-4000-8000-000000000004'
      and status = 'active'
  ) then raise exception 'A code request bypassed admin approval'; end if;
  if not exists (
    select 1 from public.league_join_requests
    where league_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'b0000000-0000-4000-8000-000000000004'
      and status = 'pending'
  ) then raise exception 'The pending code request was not recorded'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select public.review_league_join_request(
  (
    select id from public.league_join_requests
    where league_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'b0000000-0000-4000-8000-000000000004'
  ),
  true
);

-- Any active member can create a hashed, single-use invitation link and its
-- recipient joins immediately only after explicitly accepting.
do $$
declare
  invitation jsonb;
begin
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
  invitation := public.create_league_invite_link(
    'b1000000-0000-4000-8000-000000000001',
    72
  );
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000005', true);
  perform public.accept_league_invite_link(invitation ->> 'token');
  if not public.is_league_member(
    'b1000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000005'
  ) then raise exception 'Accepted invitation did not activate membership'; end if;
  if exists (
    select 1 from public.league_invite_links
    where id = (invitation ->> 'id')::uuid
      and token_hash = invitation ->> 'token'
  ) then raise exception 'A raw invitation token was stored in the database'; end if;
end;
$$;

-- The sole owner cannot leave. Ownership transfer creates a safe handoff.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.leave_league('b1000000-0000-4000-8000-000000000001');
    raise exception 'League owner was allowed to leave without a transfer';
  exception when others then
    if sqlerrm = 'League owner was allowed to leave without a transfer' then raise; end if;
  end;
end;
$$;
select public.transfer_league_ownership(
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002'
);
select public.leave_league('b1000000-0000-4000-8000-000000000001');
do $$
begin
  if (
    select count(*)
    from public.league_memberships
    where league_id = 'b1000000-0000-4000-8000-000000000001'
      and role = 'owner'
      and status = 'active'
  ) <> 1 then
    raise exception 'Ownership transfer did not preserve exactly one active owner';
  end if;
end;
$$;

do $$
declare
  created jsonb;
begin
  -- Creation is capped at three active leagues per account.
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000005', true);
  created := public.create_league('Creator Cap One', true, true);
  if created ->> 'role' <> 'owner' then
    raise exception 'League creator was not made the owner';
  end if;
  if (created ->> 'join_code') !~ '^TL-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'Generated league code has the wrong format';
  end if;
  perform public.create_league('Creator Cap Two', true, false);
  perform public.create_league('Creator Cap Three', false, true);
  begin
    perform public.create_league('Creator Cap Four', true, true);
    raise exception 'League creation cap was bypassed';
  exception when others then
    if sqlerrm = 'League creation cap was bypassed' then raise; end if;
    if position('up to three active leagues' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

-- Archive keeps the league and history row instead of deleting it.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true);
select public.archive_league('b1000000-0000-4000-8000-000000000002');
do $$
begin
  if not exists (
    select 1 from public.leagues
    where id = 'b1000000-0000-4000-8000-000000000002'
      and status = 'archived'
      and archived_at is not null
  ) then raise exception 'League archive deleted or failed to retain the league row'; end if;
end;
$$;

rollback;
