begin;

insert into auth.users(id, email, raw_user_meta_data)
values (
  '82000000-0000-4000-8000-000000000001',
  'lineup-admin@example.test',
  '{"username":"lineup_admin"}'
);

update public.profiles
set is_admin = true
where id = '82000000-0000-4000-8000-000000000001';

insert into public.league_memberships(league_id, user_id, role)
values ('00000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'admin');

insert into public.players(id, name, default_position)
select
  ('83000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'Lineup player ' || player_number,
  'outfield'::public.player_position
from generate_series(1, 10) player_number;

insert into public.games(id, game_date, status)
values (
  '84000000-0000-4000-8000-000000000001',
  now() + interval '7 days',
  'upcoming'
);

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);

select public.save_game_lineup_v2(
  '84000000-0000-4000-8000-000000000001',
  (
    select jsonb_agg(jsonb_build_object(
      'player_id', player.id,
      'team', case when player.player_number <= 5 then 'A' else 'B' end,
      'role', 'outfield',
      'slot_index', (player.player_number - 1) % 5
    ) order by player.player_number)
    from (
      select
        player_number,
        ('83000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid as id
      from generate_series(1, 10) player_number
    ) player
  ),
  'rotating',
  'rotating'
);

do $$
begin
  if (
    select status
    from public.games
    where id = '84000000-0000-4000-8000-000000000001'
  ) <> 'draft' then
    raise exception 'Saving a complete lineup did not publish the game as draft';
  end if;

  if (
    select count(*)
    from public.game_lineups
    where game_id = '84000000-0000-4000-8000-000000000001'
  ) <> 10 then
    raise exception 'The rotating lineup was not saved';
  end if;
end;
$$;

rollback;
