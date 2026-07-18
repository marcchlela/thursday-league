# Recovering players deleted before archiving was introduced

Older versions used cascading foreign keys. Deleting a player could therefore delete that player's lineup rows, match events, manual stats, and fantasy picks. Recreating only the player name is not enough because the original player UUID and dependent rows are required to restore historical points.

## Recovery source required

Use one of the following from before the deletion:

- Supabase Point-in-Time Recovery, if enabled for the project.
- A Supabase database backup.
- A SQL/CSV export containing `players`, `game_lineups`, `events`, `game_player_stats`, and `fantasy_picks`.

Restore or export the old database into a separate temporary project first. Do not overwrite the current project. Copy the missing player rows and their dependent rows back using their original UUIDs, verify fantasy totals, and then set:

```sql
update public.players
set active = false, archived_at = now()
where id in ('original-player-uuid-1', 'original-player-uuid-2');
```

The `20260719_integrity_and_history.sql` migration changes historical player foreign keys to `on delete restrict` and removes direct player-delete access, preventing the same loss in the future.
