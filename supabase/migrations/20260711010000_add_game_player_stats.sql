-- Add aggregate player statistics to the initial match schema.
create table if not exists public.game_player_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team team_code not null default 'A',
  role player_position not null default 'outfield',
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  saves integer not null default 0 check (saves >= 0),
  created_at timestamptz not null default now(),
  unique (game_id, player_id)
);

alter table public.game_player_stats add column if not exists role public.player_position not null default 'outfield';

alter table public.game_player_stats enable row level security;

drop policy if exists "game player stats readable" on public.game_player_stats;
drop policy if exists "admins insert game player stats" on public.game_player_stats;
drop policy if exists "admins update game player stats" on public.game_player_stats;
drop policy if exists "admins delete game player stats" on public.game_player_stats;

create policy "game player stats readable" on public.game_player_stats for select to authenticated using (true);
create policy "admins insert game player stats" on public.game_player_stats for insert to authenticated with check (public.is_admin());
create policy "admins update game player stats" on public.game_player_stats for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete game player stats" on public.game_player_stats for delete to authenticated using (public.is_admin());

create index if not exists game_player_stats_game_idx on public.game_player_stats(game_id);
