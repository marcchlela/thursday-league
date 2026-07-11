alter table public.game_player_stats
  add column if not exists goals integer not null default 0 check (goals >= 0),
  add column if not exists assists integer not null default 0 check (assists >= 0);
