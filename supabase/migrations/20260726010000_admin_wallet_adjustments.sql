-- Controlled virtual-coin corrections for admins.
-- Every change is transactional, idempotent, appended to the coin ledger,
-- and recorded in the admin audit history with a mandatory reason.

alter table public.coin_ledger drop constraint if exists coin_ledger_entry_type_check;
alter table public.coin_ledger add constraint coin_ledger_entry_type_check
  check (entry_type in ('initial_grant', 'stake', 'cashout', 'payout', 'settlement_correction', 'admin_adjustment'));

create or replace function public.admin_adjust_betting_wallet(
  target_user_id uuid,
  target_season_id uuid,
  adjustment_units bigint,
  adjustment_reason text,
  request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_admin_id uuid := auth.uid();
  clean_reason text := btrim(coalesce(adjustment_reason, ''));
  target_wallet public.betting_wallets%rowtype;
  existing_entry public.coin_ledger%rowtype;
  previous_balance bigint;
  next_balance bigint;
  ledger_key text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if target_user_id is null or target_season_id is null then
    raise exception 'Choose a user and season';
  end if;
  if adjustment_units is null or adjustment_units = 0 then
    raise exception 'Adjustment must be greater than zero';
  end if;
  if abs(adjustment_units) > 100000000000 then
    raise exception 'Adjustment is too large';
  end if;
  if char_length(clean_reason) < 5 or char_length(clean_reason) > 500 then
    raise exception 'Reason must be between 5 and 500 characters';
  end if;
  if request_id is null then raise exception 'Request ID is required'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'User not found';
  end if;
  if not exists (select 1 from public.seasons where id = target_season_id) then
    raise exception 'Season not found';
  end if;

  ledger_key := 'admin_adjustment:' || request_id::text;
  select * into existing_entry
  from public.coin_ledger
  where idempotency_key = ledger_key;
  if found then
    return jsonb_build_object(
      'wallet_id', existing_entry.wallet_id,
      'balance_units', existing_entry.balance_after_units,
      'adjustment_units', existing_entry.amount_units,
      'already_applied', true
    );
  end if;

  perform public.initialize_betting_wallet(target_user_id, target_season_id);
  select * into target_wallet
  from public.betting_wallets
  where user_id = target_user_id and season_id = target_season_id
  for update;
  if not found then raise exception 'Wallet could not be initialized'; end if;

  previous_balance := target_wallet.balance_units;
  next_balance := previous_balance + adjustment_units;
  if next_balance < 0 then
    raise exception 'Adjustment would make the wallet balance negative';
  end if;

  update public.betting_wallets
  set balance_units = next_balance,
      updated_at = now()
  where id = target_wallet.id;

  insert into public.coin_ledger(
    wallet_id,
    entry_type,
    amount_units,
    balance_after_units,
    idempotency_key,
    metadata
  )
  values (
    target_wallet.id,
    'admin_adjustment',
    adjustment_units,
    next_balance,
    ledger_key,
    jsonb_build_object(
      'admin_user_id', current_admin_id,
      'target_user_id', target_user_id,
      'season_id', target_season_id,
      'reason', clean_reason,
      'previous_balance_units', previous_balance
    )
  );

  insert into public.admin_audit_log(
    admin_user_id,
    action,
    reason,
    before_data,
    after_data
  )
  values (
    current_admin_id,
    'wallet_adjusted',
    clean_reason,
    jsonb_build_object(
      'wallet_id', target_wallet.id,
      'user_id', target_user_id,
      'season_id', target_season_id,
      'balance_units', previous_balance
    ),
    jsonb_build_object(
      'wallet_id', target_wallet.id,
      'user_id', target_user_id,
      'season_id', target_season_id,
      'balance_units', next_balance,
      'adjustment_units', adjustment_units
    )
  );

  return jsonb_build_object(
    'wallet_id', target_wallet.id,
    'balance_units', next_balance,
    'adjustment_units', adjustment_units,
    'already_applied', false
  );
end;
$$;

revoke all on function public.admin_adjust_betting_wallet(uuid, uuid, bigint, text, uuid) from public;
grant execute on function public.admin_adjust_betting_wallet(uuid, uuid, bigint, text, uuid) to authenticated;
