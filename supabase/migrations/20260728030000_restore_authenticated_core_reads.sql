-- RLS policies decide which rows an authenticated user can read, but the role
-- also needs the table-level SELECT privilege before PostgreSQL can evaluate
-- those policies. Make the core read contract explicit for fresh databases.

grant select on table
  public.profiles,
  public.players,
  public.games,
  public.game_lineups,
  public.events,
  public.game_player_stats,
  public.fantasy_squads,
  public.fantasy_picks
to authenticated;
