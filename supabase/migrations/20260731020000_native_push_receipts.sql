-- Expo returns a push ticket before APNs or FCM accepts a notification. Keep
-- that ticket so scheduled receipt reconciliation can expire dead devices and
-- expose real provider failures to the platform owner.

alter table public.notification_deliveries
  add column if not exists provider_ticket_id text,
  add column if not exists provider_receipt_checked_at timestamptz;

create index if not exists notification_deliveries_pending_receipt_idx
  on public.notification_deliveries(last_attempt_at, provider_ticket_id)
  where status = 'sent'
    and provider_ticket_id is not null
    and provider_receipt_checked_at is null;
