alter table public.game_player_stats
  add column if not exists team public.team_code not null default 'A';
