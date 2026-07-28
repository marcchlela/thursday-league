# Thursday League backup and recovery

The application already protects historical records inside PostgreSQL:

- players are archived instead of deleted;
- historical player foreign keys use restricted deletion;
- finalized games, lineups, events, and player statistics are trigger-locked;
- controlled corrections require a reason and create audit records;
- result versions preserve settlement history.

Those controls prevent many mistakes, but they do not replace a database backup.

## Hosted protection

In Supabase, check **Database → Backups** before every production migration. Supabase currently provides automatic daily database backups on Pro, Team, and Enterprise projects. Free projects should create regular logical exports. Point-in-Time Recovery is a paid add-on and is probably unnecessary at the current friends-league scale.

Supabase database backups do not contain uploaded Storage object bytes. Profile-avatar files therefore need a separate Storage export if they become important.

Official references:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Create a logical backup

Use the Session pooler connection string from the Supabase **Connect** panel. Never commit the URL or paste it into documentation.

```powershell
$env:SUPABASE_DB_URL = "postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres"
npm run db:backup
Remove-Item Env:SUPABASE_DB_URL
```

The command creates an ignored timestamped directory under `backups/supabase/` containing:

- `roles.sql`
- `schema.sql`
- `data.sql`
- `manifest.json` with file sizes and SHA-256 hashes

Create one backup:

- weekly while the app is active;
- immediately before every production migration;
- before a large admin correction or data import.

Copy the completed directory to encrypted off-device storage. A backup kept only on the same laptop is not disaster recovery.

## Free scheduled backups with GitHub Actions

The repository includes `.github/workflows/database-backup.yml`. It creates and verifies a logical backup every Monday and retains the private workflow artifact for seven days.

1. In the GitHub repository, open **Settings → Secrets and variables → Actions**.
2. Add a repository secret named `SUPABASE_DB_URL` using the Session pooler connection string.
3. Open **Actions → Scheduled database backup → Run workflow** once.
4. Download the artifact, verify it locally, and copy it to encrypted off-device storage.

GitHub workflow artifacts are a short-retention safety net, not the only backup location. Keep the repository access restricted, rotate the database password if the secret is ever exposed, and remember that Storage object bytes such as avatars still require a separate export.

## Verify a backup

```powershell
npm run db:backup:verify -- "backups/supabase/TIMESTAMP"
```

Hash verification proves that the exported files have not changed. It does not prove they can be restored, so perform a test restore occasionally.

## Recovery policy

1. Stop admin writes and record the approximate incident time.
2. Do not immediately overwrite production.
3. Prefer the Supabase Dashboard restore or restore-to-new-project workflow when available.
4. Otherwise verify the logical backup and restore it into a disposable local database or a new Supabase project first.
5. Validate users, games, result versions, fantasy points, wallets, ledger totals, audit history, and Storage configuration.
6. Reconfigure environment variables, Auth settings, Realtime publications, webhooks, cron jobs, and Storage objects as needed.
7. Only switch production traffic after the recovered copy has been checked.

Never run a restore command against the live connection string merely to “see if it works.” Restoration is deliberately documented rather than exposed as a one-click npm command.
