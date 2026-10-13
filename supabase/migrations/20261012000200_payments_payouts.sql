-- McCluckin's — Paystack payments, webhook idempotency, payouts, refunds, disputes.
--
-- "Paid" is set ONLY by public.mark_order_paid(), which only service_role may execute and
-- which the paystack-webhook Edge Function calls after (1) verifying the HMAC-SHA512
-- signature and (2) re-verifying the transaction with Paystack's API. No client role has
-- any path to it. There is no cash on delivery: an order is `placed` until then and is
-- auto-cancelled after unpaid_cancel_hours (see cancel_unpaid_orders).
--
-- order_events are visible to the owning buyer (RLS), so they carry neutral status notes
-- only. Payout detail (who was paid what) goes to audit_log, which is admin-only.

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------

-- One row per Paystack event ever received. The primary key is the idempotency key.
create table public.webhook_events (
  event_key    text primary key,
  provider     text not null default 'paystack',
  event_type   text not null,
  payload      jsonb not null,
  status       text not null default 'received' check (status in ('received', 'processed', 'failed')),
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);
create index webhook_events_type_idx on public.webhook_events (event_type, received_at desc);
alter table public.webhook_events enable row level security;   -- no policies: service/definer only
revoke all on public.webhook_events from public, anon, authenticated;

alter table public.transfers
  add column if not exists attempts        integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists bank_file_at    timestamptz;

-- At most one payout per supplier slice and per trip. A retry reuses the same row.
create unique index transfers_one_per_allocation on public.transfers (allocation_id) where allocation_id is not null;
create unique index transfers_one_per_trip       on public.transfers (trip_id)       where trip_id is not null;
create index transfers_queue_idx on public.transfers (status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- 2. Webhook idempotency
-- ---------------------------------------------------------------------------

-- 'new'       first time we see this event: process it
-- 'retry'     seen before but its processing failed: process it again
-- 'duplicate' already processed (or being processed): acknowledge and do nothing
create or replace function public.record_webhook_event(p_key text, p_event text, p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  insert into public.webhook_events (event_key, event_type, payload)
  values (p_key, p_event, p_payload)
  on conflict (event_key) do nothing;
  if found then
    return 'new';
  end if;
  select status into v_status from public.webhook_events where event_key = p_key for update;
  if v_status = 'failed' then
    update public.webhook_events set status = 'received', error = null where event_key = p_key;
    return 'retry';
  end if;
  return 'duplicate';
end;
$$;

create or replace function public.finish_webhook_event(p_key text, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.webhook_events
     set status = case when p_ok then 'processed' else 'failed' end,
         error = p_error, processed_at = now()
   where event_key = p_key
$$;

-- ---------------------------------------------------------------------------
-- 3. Payments
-- ---------------------------------------------------------------------------

create or replace function public.map_paystack_channel(p_channel text)
returns public.payment_channel
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_channel, ''))
    when 'card' then 'card'::public.payment_channel
    when 'bank' then 'eft'::public.payment_channel
    when 'eft' then 'eft'::public.payment_channel
    when 'bank_transfer' then 'eft'::public.payment_channel
    when 'capitec_pay' then 'capitec_pay'::public.payment_channel
    when 'qr' then 'qr'::public.payment_channel
    else null end
$$;

-- Buyer (or admin) starts a payment attempt for an unpaid order. Returns what the
-- paystack-init Edge Function needs; every attempt gets its own unique reference.
create or replace function public.start_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o          public.orders;
  v_ref      text;
  v_email    text;
  v_pay_id   uuid;
begin
  select * into o from public.orders x where x.id = p_order_id for update;
  if o.id is null or not (public.is_admin() or (o.buyer_id = auth.uid() and public.is_active_role('buyer'))) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.status <> 'placed' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  v_ref := 'mcc_' || lower(replace(o.number, '-', '')) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  insert into public.payments (order_id, paystack_reference, amount_cents, status)
  values (o.id, v_ref, o.total_cents, 'pending')
  returning id into v_pay_id;
  select p.email into v_email from public.profiles p where p.id = o.buyer_id;
  perform public.log_audit('payment.started', 'payments', v_pay_id::text, null,
    jsonb_build_object('order_id', o.id, 'amount_cents', o.total_cents));
  return jsonb_build_object('payment_id', v_pay_id, 'reference', v_ref, 'amount_cents', o.total_cents,
                            'order_id', o.id, 'order_number', o.number, 'email', v_email,
                            'quote_id', o.quote_id);
end;
$$;

-- Stored by paystack-init when an admin generates the Paystack link for a requested quote.
create or replace function public.set_quote_payment_link(p_quote_id uuid, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.quotes set paystack_payment_link = p_link where id = p_quote_id;
  perform public.log_audit('quote.link_issued', 'quotes', p_quote_id::text, null, null);
end;
$$;

-- THE only way an order becomes paid. service_role only (see grants).
create or replace function public.mark_order_paid(
  p_reference text, p_amount_cents integer, p_channel text default null, p_fee_cents integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay  public.payments;
  o    public.orders;
  q    public.quotes;
  r    record;
  a    jsonb;
  v_alloc_id uuid;
  v_buyer_prov text;
  v_sup_prov text;
  v_week date := date_trunc('week', current_date)::date;
  v_bytes bytea;
  v_code text;
begin
  select * into pay from public.payments x where x.paystack_reference = p_reference for update;
  if pay.id is null then
    raise exception 'unknown_reference' using errcode = 'P0002';
  end if;
  select * into o from public.orders x where x.id = pay.order_id for update;

  if pay.status = 'succeeded' then
    return jsonb_build_object('result', 'already_paid', 'order_id', o.id);
  end if;

  if p_amount_cents is distinct from pay.amount_cents or p_amount_cents <> o.total_cents then
    update public.payments set status = 'failed' where id = pay.id;
    perform public.log_audit('payment.amount_mismatch', 'payments', pay.id::text, null,
      jsonb_build_object('expected_cents', pay.amount_cents, 'received_cents', p_amount_cents));
    return jsonb_build_object('result', 'amount_mismatch', 'order_id', o.id);
  end if;

  -- Money arrived for an order we already cancelled (24h unpaid): keep the money record,
  -- queue a full refund, never revive the order.
  if o.status <> 'placed' then
    update public.payments set status = 'succeeded', channel = public.map_paystack_channel(p_channel),
           fee_cents = p_fee_cents where id = pay.id;
    insert into public.refunds (order_id, amount_cents, status) values (o.id, pay.amount_cents, 'pending');
    perform public.log_audit('payment.received_for_closed_order', 'payments', pay.id::text, null,
      jsonb_build_object('order_status', o.status, 'amount_cents', pay.amount_cents, 'refund_queued', true));
    return jsonb_build_object('result', 'paid_after_close_refund_queued', 'order_id', o.id);
  end if;

  v_bytes := extensions.gen_random_bytes(2);
  v_code := lpad(((get_byte(v_bytes, 0) * 256 + get_byte(v_bytes, 1)) % 10000)::text, 4, '0');

  update public.payments set status = 'succeeded', channel = public.map_paystack_channel(p_channel),
         fee_cents = p_fee_cents where id = pay.id;
  update public.orders set status = 'paid', paid_at = now(), delivery_code = v_code where id = o.id;

  -- Reserved stock becomes sold stock.
  for r in select * from public.stock_reservations
            where order_id = o.id and status = 'held' for update loop
    update public.stock set birds_available = greatest(birds_available - r.quantity, 0)
     where supplier_id = r.supplier_id and week_start = r.week_start and bird_type = r.bird_type;
    update public.stock_reservations set status = 'committed' where id = r.id;
  end loop;

  -- Supplier slices and their trips come from the quote's stored allocation plan.
  select * into q from public.quotes x where x.id = o.quote_id;
  select ad.province into v_buyer_prov from public.addresses ad where ad.id = o.address_id;
  if q.breakdown is not null then
    for a in select * from jsonb_array_elements(q.breakdown -> 'allocations') loop
      select sd.province into v_sup_prov from public.supplier_details sd
       where sd.profile_id = (a ->> 'supplier_id')::uuid;
      insert into public.allocations (order_id, supplier_id, quantity, supplier_price_cents, distance_km,
                                      status, crosses_province)
      values (o.id, (a ->> 'supplier_id')::uuid, (a ->> 'birds')::integer,
              (a ->> 'supplier_price_cents')::integer, (a ->> 'distance_km')::numeric, 'offered',
              v_buyer_prov is not null and v_sup_prov is not null and v_buyer_prov <> v_sup_prov)
      returning id into v_alloc_id;
      insert into public.trips (allocation_id, delivery_fee_cents, driver_share_cents)
      values (v_alloc_id, (a ->> 'delivery_fee_cents')::integer, (a ->> 'driver_share_cents')::integer);
      if not exists (select 1 from public.stock_reservations sr where sr.order_id = o.id) then
        -- Requested (admin-priced) quotes reserve nothing up front; take the stock now.
        update public.stock set birds_available = greatest(birds_available - (a ->> 'birds')::integer, 0)
         where supplier_id = (a ->> 'supplier_id')::uuid and week_start = v_week and bird_type = o.bird_type;
      end if;
    end loop;
  else
    perform public.log_audit('order.paid_without_plan', 'orders', o.id::text, null, null);
  end if;

  perform public.log_order_event(o.id, 'paid', 'Paystack webhook confirmed');
  perform public.log_audit('order.paid', 'orders', o.id::text,
    jsonb_build_object('status', 'placed'),
    jsonb_build_object('status', 'paid', 'amount_cents', pay.amount_cents, 'reference', p_reference));
  return jsonb_build_object('result', 'paid', 'order_id', o.id, 'number', o.number);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Payouts: queued on pickup confirm (supplier) and delivery code (driver)
-- ---------------------------------------------------------------------------

create or replace function public.admin_assign_driver(p_trip_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before uuid;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p join public.driver_details d on d.profile_id = p.id
                  where p.id = p_driver_id and p.status = 'active' and not d.paused) then
    raise exception 'driver is not available' using errcode = 'P0001';
  end if;
  select driver_id into v_before from public.trips where id = p_trip_id for update;
  update public.trips set driver_id = p_driver_id where id = p_trip_id;
  perform public.log_audit('trip.driver_assigned', 'trips', p_trip_id::text,
    jsonb_build_object('driver_id', v_before), jsonb_build_object('driver_id', p_driver_id));
end;
$$;

create or replace function public.driver_confirm_pickup(p_trip_id uuid, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.trips;
  a public.allocations;
  o public.orders;
  v_amount integer;
begin
  if not public.is_active_role('driver') then
    raise exception 'drivers only' using errcode = '42501';
  end if;
  select * into t from public.trips x where x.id = p_trip_id and x.driver_id = auth.uid() for update;
  if t.id is null then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status <> 'assigned' then raise exception 'trip_not_awaiting_pickup' using errcode = 'P0001'; end if;
  select * into a from public.allocations x where x.id = t.allocation_id for update;
  select * into o from public.orders x where x.id = a.order_id for update;
  if o.status not in ('paid', 'scheduled', 'ready', 'on_the_way') then
    raise exception 'order_not_ready' using errcode = 'P0001';
  end if;
  if p_count is null or p_count < 0 or p_count > a.quantity then
    raise exception 'invalid_count' using errcode = '22023';
  end if;

  update public.trips set status = 'picked_up', picked_up_at = now(), pickup_count = p_count where id = t.id;
  update public.allocations set status = 'collected', birds_counted = p_count where id = a.id;
  if o.status <> 'on_the_way' then
    update public.orders set status = 'on_the_way' where id = o.id;
    perform public.log_order_event(o.id, 'on_the_way', 'Birds collected');
  end if;

  v_amount := a.supplier_price_cents * least(a.quantity, p_count);
  insert into public.transfers (party_id, party_type, allocation_id, amount_cents)
  values (a.supplier_id, 'supplier', a.id, v_amount) on conflict do nothing;
  perform public.log_audit('payout.queued', 'transfers', a.id::text, null,
    jsonb_build_object('party', 'supplier', 'amount_cents', v_amount, 'order_id', o.id));
  return jsonb_build_object('picked_up', true, 'trip_id', t.id);
end;
$$;

create or replace function public.driver_confirm_delivery(p_trip_id uuid, p_code text, p_count integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.trips;
  a public.allocations;
  o public.orders;
begin
  if not public.is_active_role('driver') then
    raise exception 'drivers only' using errcode = '42501';
  end if;
  select * into t from public.trips x where x.id = p_trip_id and x.driver_id = auth.uid() for update;
  if t.id is null then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status <> 'picked_up' then raise exception 'trip_not_in_transit' using errcode = 'P0001'; end if;
  select * into a from public.allocations x where x.id = t.allocation_id;
  select * into o from public.orders x where x.id = a.order_id for update;
  if o.delivery_code is null or p_code is distinct from o.delivery_code then
    raise exception 'invalid_delivery_code' using errcode = 'P0001';
  end if;

  update public.trips set status = 'delivered', delivered_at = now(),
         delivered_count = coalesce(p_count, t.pickup_count, a.quantity) where id = t.id;
  if not exists (select 1 from public.trips tt join public.allocations aa on aa.id = tt.allocation_id
                  where aa.order_id = o.id and tt.status <> 'delivered') then
    update public.orders set status = 'delivered' where id = o.id;
    perform public.log_order_event(o.id, 'delivered', 'Delivery code confirmed');
  end if;

  insert into public.transfers (party_id, party_type, trip_id, amount_cents)
  values (t.driver_id, 'driver', t.id, t.driver_share_cents) on conflict do nothing;
  perform public.log_audit('payout.queued', 'transfers', t.id::text, null,
    jsonb_build_object('party', 'driver', 'amount_cents', t.driver_share_cents, 'order_id', o.id));
  return jsonb_build_object('delivered', true, 'trip_id', t.id);
end;
$$;

-- Server side: take the next batch of due transfers. Returns what paystack-transfer needs.
create or replace function public.claim_transfers(p_limit integer default 20)
returns table (id uuid, amount_cents integer, party_type public.party_type, recipient_code text, reference text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select t.id from public.transfers t
     where t.status = 'queued' and (t.next_attempt_at is null or t.next_attempt_at <= now())
     order by t.created_at limit p_limit for update skip locked),
  upd as (
    update public.transfers tr set attempts = tr.attempts + 1, last_attempt_at = now()
      from due where tr.id = due.id
    returning tr.id, tr.amount_cents, tr.party_type, tr.party_id)
  select u.id, u.amount_cents, u.party_type,
         case u.party_type when 'supplier' then (select sd.paystack_recipient_code from public.supplier_details sd where sd.profile_id = u.party_id)
                           else (select dd.paystack_recipient_code from public.driver_details dd where dd.profile_id = u.party_id) end,
         'mcct_' || replace(u.id::text, '-', '')
  from upd u;
end;
$$;

create or replace function public.mark_transfer_sent(p_id uuid, p_transfer_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.transfers set status = 'sent', paystack_transfer_code = p_transfer_code, failure_reason = null
   where id = p_id and status in ('queued', 'failed')
$$;

create or replace function public.mark_transfer_failed(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transfers set status = 'failed', failure_reason = left(p_reason, 500) where id = p_id and status <> 'success';
  perform public.log_audit('payout.failed', 'transfers', p_id::text, null, jsonb_build_object('reason', left(p_reason, 500)));
end;
$$;

-- Webhook result for a transfer (matched by Paystack transfer code or our reference).
create or replace function public.mark_transfer_result(p_ref text, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tr public.transfers;
  v_order uuid;
begin
  select * into tr from public.transfers t
   where t.paystack_transfer_code = p_ref or 'mcct_' || replace(t.id::text, '-', '') = p_ref
   for update;
  if tr.id is null then
    return jsonb_build_object('result', 'unknown_transfer');
  end if;
  if tr.status = 'success' then
    return jsonb_build_object('result', 'already_success');
  end if;

  if p_status = 'success' then
    update public.transfers set status = 'success', failure_reason = null where id = tr.id;
  elsif p_status = 'reversed' then
    update public.transfers set status = 'reversed', failure_reason = p_reason where id = tr.id;
  else
    update public.transfers set status = 'failed', failure_reason = left(coalesce(p_reason, 'transfer failed'), 500) where id = tr.id;
  end if;
  perform public.log_audit('payout.' || p_status, 'transfers', tr.id::text,
    jsonb_build_object('status', tr.status), jsonb_build_object('status', p_status, 'reason', p_reason));

  -- Delivered order whose payouts have all landed -> settled.
  select a.order_id into v_order from public.allocations a
   where a.id = tr.allocation_id
      or a.id = (select t2.allocation_id from public.trips t2 where t2.id = tr.trip_id);
  if p_status = 'success' and v_order is not null
     and exists (select 1 from public.orders o where o.id = v_order and o.status = 'delivered')
     and not exists (
       select 1 from public.allocations a2 where a2.order_id = v_order and not exists (
         select 1 from public.transfers x where x.allocation_id = a2.id and x.status = 'success'))
     and not exists (
       select 1 from public.trips t3 join public.allocations a3 on a3.id = t3.allocation_id
        where a3.order_id = v_order and not exists (
         select 1 from public.transfers x where x.trip_id = t3.id and x.status = 'success')) then
    update public.orders set status = 'settled' where id = v_order;
    perform public.log_order_event(v_order, 'settled', 'Order complete');
  end if;
  return jsonb_build_object('result', p_status, 'transfer_id', tr.id);
end;
$$;

-- Failed transfers go back on the queue with a growing delay, until payout_max_attempts;
-- after that they wait for the bank-file fallback.
create or replace function public.retry_failed_transfers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max  integer := public.app_setting('payout_max_attempts', 5)::integer;
  v_step integer := public.app_setting('payout_retry_minutes', 15)::integer;
  n integer;
begin
  with r as (
    update public.transfers t
       set status = 'queued', next_attempt_at = now() + make_interval(mins => v_step * t.attempts)
     where t.status = 'failed' and t.attempts < v_max and t.bank_file_at is null
       and coalesce(t.last_attempt_at, t.updated_at) <= now() - make_interval(mins => v_step * greatest(t.attempts, 1))
    returning t.id)
  select count(*) into n from r;
  if n > 0 then
    perform public.log_audit('payout.retry_queued', 'transfers', null, null, jsonb_build_object('count', n));
  end if;
  return n;
end;
$$;

-- Fallback when Paystack transfers are unavailable or exhausted: a CSV the finance
-- admin pays by EFT. Bank details are stored encrypted and are NOT decrypted here;
-- the finance admin looks them up in the secure vault by recipient name.
create or replace function public.export_bank_file()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := public.app_setting('payout_max_attempts', 5)::integer;
  v_csv text;
  v_ids uuid[];
begin
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  with due as (
    select t.*, p.full_name, p.business_name,
           (select o.number from public.orders o join public.allocations a on a.order_id = o.id
             where a.id = coalesce(t.allocation_id, (select tt.allocation_id from public.trips tt where tt.id = t.trip_id)) limit 1) as order_number
      from public.transfers t join public.profiles p on p.id = t.party_id
     where t.status = 'failed' and t.attempts >= v_max and t.bank_file_at is null
  )
  select 'reference,party_type,name,business,order_number,amount_rand' || chr(10)
         || coalesce(string_agg(format('%s,%s,"%s","%s",%s,%s', 'mcct_' || replace(id::text, '-', ''), party_type,
              replace(full_name, '"', '""'), replace(coalesce(business_name, ''), '"', '""'),
              coalesce(order_number, ''), to_char(amount_cents / 100.0, 'FM999999990.00')), chr(10) order by created_at), ''),
         array_agg(id)
    into v_csv, v_ids from due;
  if v_ids is not null then
    update public.transfers set bank_file_at = now() where id = any (v_ids);
    perform public.log_audit('payout.bank_file_exported', 'transfers', null, null, jsonb_build_object('count', array_length(v_ids, 1)));
  end if;
  return v_csv;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Refunds and disputes
-- ---------------------------------------------------------------------------

create or replace function public.admin_queue_refund(p_order_id uuid, p_amount_cents integer, p_case_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid integer;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select coalesce(sum(amount_cents), 0) into v_paid from public.payments where order_id = p_order_id and status = 'succeeded';
  if p_amount_cents <= 0 or p_amount_cents > v_paid
     - coalesce((select sum(r.amount_cents) from public.refunds r where r.order_id = p_order_id and r.status in ('pending', 'processing', 'succeeded')), 0) then
    raise exception 'refund exceeds amount paid' using errcode = '22023';
  end if;
  insert into public.refunds (order_id, case_id, amount_cents, status)
  values (p_order_id, p_case_id, p_amount_cents, 'pending') returning id into v_id;
  perform public.log_audit('refund.queued', 'refunds', v_id::text, null, jsonb_build_object('order_id', p_order_id, 'amount_cents', p_amount_cents));
  return v_id;
end;
$$;

-- For paystack-transfer: which transaction to refund and how much; marks it processing.
create or replace function public.begin_refund(p_refund_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refunds;
  v_ref text;
begin
  select * into r from public.refunds x where x.id = p_refund_id and x.status in ('pending', 'failed') for update;
  if r.id is null then raise exception 'refund not pending' using errcode = 'P0001'; end if;
  select p.paystack_reference into v_ref from public.payments p
   where p.order_id = r.order_id and p.status in ('succeeded', 'refunded') order by p.created_at desc limit 1;
  if v_ref is null then raise exception 'no successful payment to refund' using errcode = 'P0001'; end if;
  update public.refunds set status = 'processing' where id = r.id;
  return jsonb_build_object('refund_id', r.id, 'reference', v_ref, 'amount_cents', r.amount_cents);
end;
$$;

create or replace function public.complete_refund_request(p_refund_id uuid, p_paystack_refund_id text, p_ok boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.refunds
     set status = case when p_ok then 'processing'::public.refund_status else 'failed'::public.refund_status end,
         paystack_refund_id = coalesce(p_paystack_refund_id, paystack_refund_id)
   where id = p_refund_id
$$;

-- refund.processed
create or replace function public.apply_refund_processed(p_transaction_ref text, p_amount_cents integer, p_paystack_refund_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  r   public.refunds;
  v_refunded integer;
begin
  select * into pay from public.payments x where x.paystack_reference = p_transaction_ref for update;
  if pay.id is null then return jsonb_build_object('result', 'unknown_transaction'); end if;

  select * into r from public.refunds x
   where x.order_id = pay.order_id
     and (x.paystack_refund_id = p_paystack_refund_id
          or (x.status in ('pending', 'processing') and x.amount_cents = p_amount_cents))
   order by (x.paystack_refund_id = p_paystack_refund_id) desc, x.created_at limit 1 for update;
  if r.id is null then
    insert into public.refunds (order_id, amount_cents, paystack_refund_id, status)
    values (pay.order_id, p_amount_cents, p_paystack_refund_id, 'succeeded') returning * into r;
  else
    if r.status = 'succeeded' then return jsonb_build_object('result', 'already_processed'); end if;
    update public.refunds set status = 'succeeded', paystack_refund_id = coalesce(p_paystack_refund_id, paystack_refund_id) where id = r.id;
  end if;

  select coalesce(sum(x.amount_cents), 0) into v_refunded from public.refunds x
   where x.order_id = pay.order_id and x.status = 'succeeded';
  if v_refunded >= pay.amount_cents then
    update public.payments set status = 'refunded' where id = pay.id;
    update public.orders set status = 'refunded' where id = pay.order_id and status <> 'refunded';
    perform public.log_order_event(pay.order_id, 'refunded', 'Refund processed');
  end if;
  perform public.log_audit('refund.processed', 'refunds', r.id::text, null,
    jsonb_build_object('amount_cents', p_amount_cents, 'order_id', pay.order_id));
  return jsonb_build_object('result', 'processed', 'refund_id', r.id);
end;
$$;

-- charge.dispute.create
create or replace function public.record_dispute(p_transaction_ref text, p_dispute_id text, p_detail jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  o public.orders;
begin
  select * into pay from public.payments x where x.paystack_reference = p_transaction_ref for update;
  if pay.id is null then return jsonb_build_object('result', 'unknown_transaction'); end if;
  update public.payments set status = 'disputed' where id = pay.id and status <> 'refunded';
  select * into o from public.orders x where x.id = pay.order_id;
  perform public.log_order_event(o.id, o.status, 'Payment under review');
  perform public.log_audit('payment.disputed', 'payments', pay.id::text, null,
    jsonb_build_object('dispute_id', p_dispute_id, 'detail', p_detail));
  return jsonb_build_object('result', 'disputed', 'order_id', o.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('record_webhook_event', 'finish_webhook_event', 'map_paystack_channel',
         'start_payment', 'set_quote_payment_link', 'mark_order_paid', 'admin_assign_driver',
         'driver_confirm_pickup', 'driver_confirm_delivery', 'claim_transfers', 'mark_transfer_sent',
         'mark_transfer_failed', 'mark_transfer_result', 'retry_failed_transfers', 'export_bank_file',
         'admin_queue_refund', 'begin_refund', 'complete_refund_request', 'apply_refund_processed',
         'record_dispute')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$$;

-- Signed-in callers (each checks role/ownership inside)
grant execute on function public.start_payment(uuid) to authenticated;
grant execute on function public.set_quote_payment_link(uuid, text) to authenticated;       -- admin inside
grant execute on function public.admin_assign_driver(uuid, uuid) to authenticated;          -- admin inside
grant execute on function public.admin_queue_refund(uuid, integer, uuid) to authenticated;  -- admin inside
grant execute on function public.driver_confirm_pickup(uuid, integer) to authenticated;     -- driver inside
grant execute on function public.driver_confirm_delivery(uuid, text, integer) to authenticated;
grant execute on function public.export_bank_file() to authenticated;                       -- admin inside

-- Server only: the Edge Functions and cron. This is the whole "paid" attack surface.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function
      public.record_webhook_event(text, text, jsonb), public.finish_webhook_event(text, boolean, text),
      public.mark_order_paid(text, integer, text, integer),
      public.claim_transfers(integer), public.mark_transfer_sent(uuid, text),
      public.mark_transfer_failed(uuid, text), public.mark_transfer_result(text, text, text),
      public.retry_failed_transfers(), public.export_bank_file(),
      public.begin_refund(uuid), public.complete_refund_request(uuid, text, boolean),
      public.apply_refund_processed(text, integer, text), public.record_dispute(text, text, jsonb)
    to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Schedules (only where pg_cron exists; safe to run anywhere)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mc-expire-quotes',         '* * * * *',   'select public.expire_quotes()');
    perform cron.schedule('mc-cancel-unpaid-orders',  '*/15 * * * *', 'select public.cancel_unpaid_orders()');
    perform cron.schedule('mc-retry-transfers',       '*/10 * * * *', 'select public.retry_failed_transfers()');
    -- 05:00 SAST = 03:00 UTC
    perform cron.schedule('mc-flag-expiring-docs',    '0 3 * * *',   'select public.flag_expiring_documents()');
    -- PDMA report for the previous month, drafted on the 1st; submission by the 15th is manual
    perform cron.schedule('mc-pdma-report',           '0 4 1 * *',   'select public.generate_pdma_report()');
  end if;
end
$$;
