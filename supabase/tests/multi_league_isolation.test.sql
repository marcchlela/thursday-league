begin;

-- Every tenant-owned table must have RLS enabled, and anonymous visitors must
-- not receive direct table access. This catches a future table being added to
-- the multi-league schema without joining the security boundary.
do $$
declare
  table_name text;
  tenant_tables constant text[] := array[
    'leagues',
    'league_memberships',
    'league_join_requests',
    'league_invite_links',
    'players',
    'seasons',
    'league_settings',
    'games',
    'game_lineups',
    'events',
    'game_player_stats',
    'admin_audit_log',
    'fantasy_squads',
    'fantasy_picks',
    'notification_preferences',
    'notification_dispatches',
    'notification_deliveries',
    'betting_settings',
    'odds_generation_runs',
    'betting_markets',
    'betting_outcomes',
    'betting_wallets',
    'bet_slips',
    'bet_legs',
    'game_result_versions',
    'bet_settlement_runs',
    'coin_ledger'
  ];
begin
  foreach table_name in array tenant_tables loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT') then
      raise exception 'Anonymous visitors can read public.%', table_name;
    end if;
  end loop;
end;
$$;

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

do $$
begin
  if exists (
    select 1
    from (
      values
        ('public.set_active_league(uuid)'),
        ('public.create_league(text,boolean,boolean,text)'),
        ('public.preview_league_by_code(text)'),
        ('public.request_to_join_league(text)'),
        ('public.review_league_join_request(uuid,boolean)'),
        ('public.create_league_invite_link(uuid,integer)'),
        ('public.preview_league_invite_link(text)'),
        ('public.accept_league_invite_link(text)'),
        ('public.rotate_league_join_code(uuid)'),
        ('public.update_league_options(uuid,text,boolean,boolean,integer)'),
        ('public.set_league_member_role(uuid,uuid,boolean)'),
        ('public.transfer_league_ownership(uuid,uuid)'),
        ('public.remove_league_member(uuid,uuid)'),
        ('public.leave_league(uuid)'),
        ('public.archive_league(uuid)'),
        ('public.set_season_mode(uuid,text,uuid)'),
        ('public.create_custom_season(uuid,text,date,date,boolean)'),
        ('public.update_custom_season(uuid,uuid,text,date,date)'),
        ('public.get_league_readiness(uuid,uuid)'),
        ('public.get_platform_league_stats()'),
        ('public.league_betting_availability(uuid)'),
        ('public.place_league_bet(uuid,uuid[],numeric,uuid)'),
        ('public.get_betting_standings(uuid)'),
        ('public.system_generate_league_betting_markets(uuid,uuid,text,jsonb,jsonb)')
    ) sensitive(signature)
    where has_function_privilege('anon', sensitive.signature, 'EXECUTE')
  ) then
    raise exception 'Anonymous visitors can execute a multi-league RPC';
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
    select 1 from public.seasons
    where id = 'b2000000-0000-4000-8000-000000000002'
  ) then raise exception 'A member can read another league season'; end if;
  if exists (
    select 1 from public.league_settings
    where league_id = 'b1000000-0000-4000-8000-000000000002'
  ) then raise exception 'A member can read another league settings row'; end if;
  if exists (
    select 1 from public.league_memberships
    where league_id = 'b1000000-0000-4000-8000-000000000002'
  ) then raise exception 'A member can enumerate another league directory'; end if;
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
  if exists (
    select 1 from public.fantasy_picks
    where id = 'b6000000-0000-4000-8000-000000000002'
  ) then raise exception 'A member can read another league Fantasy pick'; end if;
  begin
    perform public.get_league_member_directory(
      'b1000000-0000-4000-8000-000000000002'
    );
    raise exception 'A member read another league member directory RPC';
  exception when others then
    if sqlerrm = 'A member read another league member directory RPC' then raise; end if;
    if position('Active league membership required' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.get_league_betting_public_settings(
      'b1000000-0000-4000-8000-000000000002'
    );
    raise exception 'A member read another league betting settings RPC';
  exception when others then
    if sqlerrm = 'A member read another league betting settings RPC' then raise; end if;
    if position('Active league membership required' in sqlerrm) = 0 then raise; end if;
  end;
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

  begin
    perform public.rotate_league_join_code(
      'b1000000-0000-4000-8000-000000000002'
    );
    raise exception 'League A owner rotated League B join code';
  exception when others then
    if sqlerrm = 'League A owner rotated League B join code' then raise; end if;
  end;

  begin
    perform public.update_league_options(
      'b1000000-0000-4000-8000-000000000002',
      'Cross-tenant rename',
      true,
      true,
      3
    );
    raise exception 'League A owner changed League B options';
  exception when others then
    if sqlerrm = 'League A owner changed League B options' then raise; end if;
  end;

  begin
    perform public.transfer_league_ownership(
      'b1000000-0000-4000-8000-000000000002',
      'b0000000-0000-4000-8000-000000000001'
    );
    raise exception 'League A owner took ownership of League B';
  exception when others then
    if sqlerrm = 'League A owner took ownership of League B' then raise; end if;
  end;

  begin
    perform public.archive_league(
      'b1000000-0000-4000-8000-000000000002'
    );
    raise exception 'League A owner archived League B';
  exception when others then
    if sqlerrm = 'League A owner archived League B' then raise; end if;
  end;
end;
$$;

-- A guessed/shared code creates a pending request only.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000004', true);
select public.request_to_join_league('TL-AAAA-2222');
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
  if (
    select count(*)
    from public.league_join_requests
    where league_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'b0000000-0000-4000-8000-000000000004'
      and status = 'pending'
  ) <> 1 then raise exception 'A duplicate join request created duplicate pending rows'; end if;
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

-- Removed members may request to join again. Their old historical request and
-- membership rows are retained, while the new approval safely reactivates them.
select public.remove_league_member(
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004'
);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000004', true);
select public.request_to_join_league('TL-AAAA-2222');
do $$
begin
  if (
    select count(*)
    from public.league_join_requests
    where league_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'b0000000-0000-4000-8000-000000000004'
      and status = 'pending'
  ) <> 1 then raise exception 'A removed member could not request to join again'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select public.review_league_join_request(
  (
    select id from public.league_join_requests
    where league_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'b0000000-0000-4000-8000-000000000004'
      and status = 'pending'
  ),
  true
);

-- Expired tokens cannot be previewed or accepted.
insert into public.league_invite_links(
  league_id,
  token_hash,
  created_by,
  created_at,
  expires_at
) values (
  'b1000000-0000-4000-8000-000000000001',
  encode(extensions.digest('expired-invite-token', 'sha256'), 'hex'),
  'b0000000-0000-4000-8000-000000000001',
  now() - interval '2 hours',
  now() - interval '1 hour'
);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000005', true);
do $$
begin
  begin
    perform public.preview_league_invite_link('expired-invite-token');
    raise exception 'An expired invitation was previewed';
  exception when others then
    if sqlerrm = 'An expired invitation was previewed' then raise; end if;
    if position('invalid or has expired' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.accept_league_invite_link('expired-invite-token');
    raise exception 'An expired invitation was accepted';
  exception when others then
    if sqlerrm = 'An expired invitation was accepted' then raise; end if;
    if position('invalid or has expired' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

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
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000004', true);
  begin
    perform public.accept_league_invite_link(invitation ->> 'token');
    raise exception 'A single-use invitation was accepted twice';
  exception when others then
    if sqlerrm = 'A single-use invitation was accepted twice' then raise; end if;
    if position('invalid or has expired' in sqlerrm) = 0 then raise; end if;
  end;
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
  begin
    perform public.delete_own_account('DELETE');
    raise exception 'League owner deleted their account without a transfer';
  exception when others then
    if sqlerrm = 'League owner deleted their account without a transfer' then raise; end if;
    if position('Transfer league ownership before deactivating or deleting' in sqlerrm) = 0 then raise; end if;
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

-- The new owner controls admin/member transitions and removals, and now also
-- receives the account-lifecycle ownership protection.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select public.set_league_member_role(
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004',
  true
);
select public.set_league_member_role(
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004',
  false
);
select public.remove_league_member(
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004'
);
do $$
begin
  if not exists (
    select 1
    from public.league_memberships
    where league_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'b0000000-0000-4000-8000-000000000004'
      and role = 'member'
      and status = 'removed'
  ) then raise exception 'Owner admin/member/removal lifecycle did not persist safely'; end if;
  begin
    perform public.delete_own_account('DELETE');
    raise exception 'Transferred owner deleted their account without another transfer';
  exception when others then
    if sqlerrm = 'Transferred owner deleted their account without another transfer' then raise; end if;
    if position('Transfer league ownership before deactivating or deleting' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

do $$
declare
  created jsonb;
begin
  -- Creation is capped at three active leagues per account.
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000005', true);
  created := public.create_league('Creator Cap One', true, true, 'Europe/Paris');
  if created ->> 'role' <> 'owner' then
    raise exception 'League creator was not made the owner';
  end if;
  if (created ->> 'join_code') !~ '^TL-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'Generated league code has the wrong format';
  end if;
  if created ->> 'timezone' <> 'Europe/Paris' or not exists (
    select 1
    from public.leagues
    where id = (created ->> 'id')::uuid
      and timezone = 'Europe/Paris'
  ) then
    raise exception 'League creation did not preserve the owner timezone';
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
insert into public.league_invite_links(
  league_id,
  token_hash,
  created_by,
  expires_at
) values (
  'b1000000-0000-4000-8000-000000000002',
  encode(extensions.digest('archived-league-token', 'sha256'), 'hex'),
  'b0000000-0000-4000-8000-000000000003',
  now() + interval '1 day'
);
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

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.preview_league_by_code('TL-BBBB-3333');
    raise exception 'An archived league was discovered by join code';
  exception when others then
    if sqlerrm = 'An archived league was discovered by join code' then raise; end if;
    if position('league code is not valid' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.request_to_join_league('TL-BBBB-3333');
    raise exception 'An archived league accepted a code join request';
  exception when others then
    if sqlerrm = 'An archived league accepted a code join request' then raise; end if;
    if position('league code is not valid' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.preview_league_invite_link('archived-league-token');
    raise exception 'An archived league invitation was previewed';
  exception when others then
    if sqlerrm = 'An archived league invitation was previewed' then raise; end if;
    if position('league is not available' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.accept_league_invite_link('archived-league-token');
    raise exception 'An archived league invitation was accepted';
  exception when others then
    if sqlerrm = 'An archived league invitation was accepted' then raise; end if;
    if position('league is not available' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

rollback;
