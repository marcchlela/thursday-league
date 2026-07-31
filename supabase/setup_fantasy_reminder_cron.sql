-- Run this separately after the migrations. This one scheduled request handles
-- matchday reminders, Fantasy deadlines, and failed custom-send recovery.
-- Use the production app URL without a trailing slash and the same CRON_SECRET
-- that you add to Vercel Production environment variables.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://YOUR-PRODUCTION-DOMAIN',
  'thursday_league_app_url',
  'Production URL used by the fantasy reminder job'
);

select vault.create_secret(
  'REPLACE-WITH-A-LONG-RANDOM-CRON-SECRET',
  'thursday_league_cron_secret',
  'Authorization secret for the fantasy reminder endpoint'
);

select cron.schedule(
  'thursday-league-fantasy-reminders',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'thursday_league_app_url') || '/api/cron/fantasy-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'thursday_league_cron_secret')
    ),
    timeout_milliseconds := 10000
  );
  $$
);
