-- McCluckin's: RPCs the buyer, supplier, driver and admin screens call.
-- Every function is SECURITY DEFINER with an empty search_path and checks the caller's role inside.

insert into public.settings (key, value, is_public, description)
values ('support_phone', '"+27000000000"'::jsonb, true, 'Masked McCluckin''s support number shown to buyers and drivers')
on conflict (key) do nothing;

do $storage$
begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public) values ('documents', 'documents', false), ('case-photos', 'case-photos', false)
    on conflict (id) do nothing;
    execute $p$create policy documents_owner_rw on storage.objects for all to authenticated
      using (bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
      with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy case_photos_owner_rw on storage.objects for all to authenticated
      using (bucket_id = 'case-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
      with check (bucket_id = 'case-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end
$storage$;

-- bank details (encrypted at rest; key lives in a table no API role can read)
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from public, anon, authenticated;
insert into public.app_secrets (name, value)
values ('bank_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function public.save_bank_details(
  bank_name text, account_holder text, account_number text, branch_code text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_blob bytea;
  v_role public.user_role := public.current_profile_role();
begin
  if v_role not in ('supplier', 'driver') or public.current_profile_status() <> 'active' then
    raise exception 'suppliers and drivers only' using errcode = '42501';
  end if;
  if coalesce(trim(account_number), '') !~ '^[0-9]{6,17}$' then
    raise exception 'invalid_account_number' using errcode = '22023';
  end if;
  select value into v_key from public.app_secrets where name = 'bank_key';
  v_blob := extensions.pgp_sym_encrypt(
    jsonb_build_object('bank_name', bank_name, 'account_holder', account_holder,
                       'account_number', account_number, 'branch_code', branch_code)::text, v_key);
  if v_role = 'supplier' then
    update public.supplier_details set bank_details_encrypted = v_blob, paystack_recipient_code = null where profile_id = auth.uid();
  else
    update public.driver_details set bank_details_encrypted = v_blob, paystack_recipient_code = null where profile_id = auth.uid();
  end if;
  perform public.log_audit('bank.saved', 'profiles', auth.uid()::text, null, null);
end $$;

create or replace function public.get_bank_details_masked()
returns table (bank_name text, account_holder text, account_last4 text)
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_blob bytea;
  j jsonb;
begin
  if public.current_profile_role() = 'supplier' then
    select sd.bank_details_encrypted into v_blob from public.supplier_details sd where sd.profile_id = auth.uid();
  elsif public.current_profile_role() = 'driver' then
    select dd.bank_details_encrypted into v_blob from public.driver_details dd where dd.profile_id = auth.uid();
  end if;
  if v_blob is null then return; end if;
  select value into v_key from public.app_secrets where name = 'bank_key';
  j := extensions.pgp_sym_decrypt(v_blob, v_key)::jsonb;
  return query select j ->> 'bank_name', j ->> 'account_holder', right(j ->> 'account_number', 4);
end $$;

-- buyer
create or replace function public.decline_quote(p_quote_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.quotes set status = 'declined'
   where id = p_quote_id and buyer_id = auth.uid() and status = 'open';
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.request_custom_quote(
  p_address_id uuid, p_bird_type public.bird_type, p_weight_band public.weight_band, p_quantity integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare j jsonb;
begin
  j := public.request_quote(p_address_id, p_bird_type, p_weight_band, p_quantity);
  return coalesce(j ->> 'quote_id', j ->> 'id')::uuid;
end $$;

create or replace function public.buyer_order_tracking(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  if not public.buyer_owns_order(p_order_id) then return null; end if;
  select split_part(p.full_name, ' ', 1) as first_name,
         dd.vehicle_type::text as vehicle,
         sum(t.delivered_count) as delivered
    into r
    from public.allocations a
    join public.trips t on t.allocation_id = a.id
    left join public.profiles p on p.id = t.driver_id
    left join public.driver_details dd on dd.profile_id = t.driver_id
   where a.order_id = p_order_id
   group by 1, 2 limit 1;
  return jsonb_build_object(
    'eta_at', null, 'driver_first_name', r.first_name, 'vehicle', r.vehicle,
    'call_number', (select value #>> '{}' from public.settings where key = 'support_phone'),
    'delivered_count', r.delivered, 'lat', null, 'lng', null);
end $$;

-- driver
drop function if exists public.driver_confirm_pickup(uuid, integer);
drop function if exists public.driver_confirm_delivery(uuid, text, integer);

create or replace function public.driver_confirm_pickup(p_trip_id uuid, p_count integer, p_photo_path text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.trips; a public.allocations; o public.orders; v_amount integer; v_need boolean;
begin
  if not public.is_active_role('driver') then raise exception 'drivers only' using errcode = '42501'; end if;
  select * into t from public.trips x where x.id = p_trip_id and x.driver_id = auth.uid() for update;
  if t.id is null then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status <> 'assigned' then raise exception 'trip_not_awaiting_pickup' using errcode = 'P0001'; end if;
  select * into a from public.allocations x where x.id = t.allocation_id for update;
  select * into o from public.orders x where x.id = a.order_id for update;
  if o.status not in ('paid', 'scheduled', 'ready', 'on_the_way') then raise exception 'order_not_ready' using errcode = 'P0001'; end if;
  if p_count is null or p_count < 0 or p_count > a.quantity then raise exception 'invalid_count' using errcode = '22023'; end if;
  select coalesce(sr.disinfection_photo, false) into v_need from public.supplier_requirements sr where sr.supplier_id = a.supplier_id;
  if coalesce(v_need, false) and p_photo_path is null then raise exception 'disinfection_photo_required' using errcode = 'P0001'; end if;
  update public.trips set status = 'picked_up', picked_up_at = now(), pickup_count = p_count,
         disinfection_photo_path = coalesce(p_photo_path, disinfection_photo_path) where id = t.id;
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
end $$;

create or replace function public.driver_confirm_delivery(p_trip_id uuid, p_code text, p_count integer default null, p_photo_path text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.trips; a public.allocations; o public.orders;
begin
  if not public.is_active_role('driver') then raise exception 'drivers only' using errcode = '42501'; end if;
  select * into t from public.trips x where x.id = p_trip_id and x.driver_id = auth.uid() for update;
  if t.id is null then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status <> 'picked_up' then raise exception 'trip_not_in_transit' using errcode = 'P0001'; end if;
  select * into a from public.allocations x where x.id = t.allocation_id;
  select * into o from public.orders x where x.id = a.order_id for update;
  if o.delivery_code is null or p_code is distinct from o.delivery_code then raise exception 'invalid_delivery_code' using errcode = 'P0001'; end if;
  update public.trips set status = 'delivered', delivered_at = now(),
         delivered_count = coalesce(p_count, t.pickup_count, a.quantity),
         pod_photo_path = coalesce(p_photo_path, pod_photo_path) where id = t.id;
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
end $$;

create or replace function public.driver_trip_stops()
returns table (trip_id uuid, pickup_address text, pickup_lat double precision, pickup_lng double precision,
               drop_address text, drop_lat double precision, drop_lng double precision,
               buyer_first_name text, expected_birds integer, slot_label text)
language sql stable security definer set search_path = '' as $$
  select t.id, sd.pickup_address,
         extensions.st_y(sd.location::extensions.geometry), extensions.st_x(sd.location::extensions.geometry),
         ad.street || ', ' || ad.town,
         extensions.st_y(ad.location::extensions.geometry), extensions.st_x(ad.location::extensions.geometry),
         split_part(bp.full_name, ' ', 1), a.quantity, sl.label
    from public.trips t
    join public.allocations a on a.id = t.allocation_id
    join public.orders o on o.id = a.order_id
    left join public.supplier_details sd on sd.profile_id = a.supplier_id
    left join public.addresses ad on ad.id = o.address_id
    left join public.profiles bp on bp.id = o.buyer_id
    left join public.delivery_slots sl on sl.id = o.slot_id
   where t.driver_id = auth.uid() and public.is_active_role('driver') and t.status in ('assigned', 'picked_up')
$$;

create or replace function public.driver_pickup_info(p_trip_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trip_id', t.id, 'permit_valid_until', a.permit_valid_until,
    'has_removal_permit', a.removal_permit_path is not null,
    'crosses_province', a.crosses_province, 'has_movement_permit', a.movement_permit_path is not null,
    'crates', a.crates, 'max_per_crate', sr.max_per_crate, 'max_per_crate_hot', sr.max_per_crate_hot,
    'disinfection_photo_required', coalesce(sr.disinfection_photo, false), 'expected_birds', a.quantity)
    from public.trips t
    join public.allocations a on a.id = t.allocation_id
    left join public.supplier_requirements sr on sr.supplier_id = a.supplier_id
   where t.id = p_trip_id and t.driver_id = auth.uid() and public.is_active_role('driver')
$$;

create or replace function public.driver_supplier_requirements()
returns table (label text, province text, covered_vehicle boolean, max_journey_hours numeric, needs_crates boolean)
language sql stable security definer set search_path = '' as $$
  select 'Farm ' || chr(64 + (row_number() over (order by sd.profile_id))::int), sd.province,
         coalesce(sr.covered_vehicle, false), sr.max_journey_hours, sr.crate_spec is not null
    from public.supplier_details sd
    left join public.supplier_requirements sr on sr.supplier_id = sd.profile_id
   where public.is_active_role('driver') and public.driver_matched_to_supplier(sd.profile_id)
$$;

-- admin
create or replace function public.match_suppliers(p_order_id uuid)
returns table (supplier_id uuid, supplier_name text, province text, same_province boolean, distance_km numeric,
               journey_minutes integer, price_cents integer, landed_cents_per_bird integer,
               est_delivery_fee_cents integer, stock_available integer, requirement_fit text,
               requirement_notes text[], avian_flu_zone public.avian_flu_zone, paused boolean, rating_avg numeric)
language plpgsql stable security definer set search_path = '' as $$
declare o public.orders; ad public.addresses;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into o from public.orders x where x.id = p_order_id;
  select * into ad from public.addresses x where x.id = o.address_id;
  return query
    select sd.profile_id, coalesce(sd.farm_name, p.full_name), sd.province, sd.province is not distinct from ad.province,
           coalesce(m.distance_km, round((extensions.st_distance(sd.location, ad.location) / 1000)::numeric, 1)),
           coalesce(m.distance_km, round((extensions.st_distance(sd.location, ad.location) / 1000)::numeric, 1))::integer,
           coalesce(m.price_cents, 0),
           coalesce(m.price_cents, 0) + (o.delivery_fee_cents / greatest(o.quantity, 1)),
           o.delivery_fee_cents,
           coalesce(m.stock_available, 0),
           case when sd.paused or sd.avian_flu_zone = 'controlled' then 'fail' when m.supplier_id is null then 'partial' else 'ok' end,
           case when sd.paused then array['paused'] when m.supplier_id is null then array['no stock or out of range'] else array[]::text[] end,
           sd.avian_flu_zone, sd.paused, sd.rating_avg
      from public.supplier_details sd
      join public.profiles p on p.id = sd.profile_id and p.status = 'active'
      left join public.match_suppliers(o.bird_type, o.weight_band, ad.location, ad.province) m on m.supplier_id = sd.profile_id
     order by coalesce(m.rank, 9999), 5;
end $$;

create or replace function public.admin_assign_supplier(p_order_id uuid, p_supplier_id uuid, p_quantity integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o public.orders; ad public.addresses; m record; v_alloc uuid; v_assigned integer;
  v_fee integer; v_share integer; v_sup_prov text;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into o from public.orders x where x.id = p_order_id for update;
  if o.id is null or o.status not in ('paid', 'scheduled') then raise exception 'order_not_assignable' using errcode = 'P0001'; end if;
  select coalesce(sum(quantity), 0) into v_assigned from public.allocations where order_id = o.id and status <> 'declined';
  if p_quantity <= 0 or v_assigned + p_quantity > o.quantity then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  select * into ad from public.addresses x where x.id = o.address_id;
  select * into m from public.match_suppliers(o.id) x where x.supplier_id = p_supplier_id;
  if m.supplier_id is null or m.paused then raise exception 'supplier_unavailable' using errcode = 'P0001'; end if;
  select province into v_sup_prov from public.supplier_details where profile_id = p_supplier_id;
  v_fee := o.delivery_fee_cents * p_quantity / greatest(o.quantity, 1);
  v_share := v_fee * public.app_setting('driver_share_pct', 70)::integer / 100;
  insert into public.allocations (order_id, supplier_id, quantity, supplier_price_cents, distance_km, status, crosses_province)
  values (o.id, p_supplier_id, p_quantity, m.price_cents, m.distance_km, 'offered', v_sup_prov is distinct from ad.province)
  returning id into v_alloc;
  insert into public.trips (allocation_id, delivery_fee_cents, driver_share_cents) values (v_alloc, v_fee, v_share);
  perform public.log_audit('allocation.assigned', 'allocations', v_alloc::text, null,
    jsonb_build_object('order_id', o.id, 'supplier_id', p_supplier_id, 'quantity', p_quantity));
  return v_alloc;
end $$;

create or replace function public.admin_schedule_order(p_order_id uuid, p_delivery_date date, p_slot_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update public.orders set delivery_date = p_delivery_date, slot_id = p_slot_id,
         status = case when status = 'paid' then 'scheduled'::public.order_status else status end
   where id = p_order_id and status in ('paid', 'scheduled');
  if not found then raise exception 'order_not_schedulable' using errcode = 'P0001'; end if;
  perform public.log_order_event(p_order_id, 'scheduled', 'Delivery on ' || p_delivery_date::text);
  perform public.log_audit('order.scheduled', 'orders', p_order_id::text, null,
    jsonb_build_object('delivery_date', p_delivery_date, 'slot_id', p_slot_id));
end $$;

-- accepts an allocation id (screens) or a trip id (legacy callers and tests)
drop function if exists public.admin_assign_driver(uuid, uuid);
create or replace function public.admin_assign_driver(p_allocation_id uuid, p_driver_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_before uuid; v_trip uuid;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p join public.driver_details d on d.profile_id = p.id
                  where p.id = p_driver_id and p.status = 'active' and not d.paused) then
    raise exception 'driver is not available' using errcode = 'P0001';
  end if;
  select id, driver_id into v_trip, v_before from public.trips where allocation_id = p_allocation_id or id = p_allocation_id for update;
  if v_trip is null then raise exception 'trip not found' using errcode = 'P0002'; end if;
  update public.trips set driver_id = p_driver_id where id = v_trip;
  perform public.log_audit('trip.driver_assigned', 'trips', v_trip::text,
    jsonb_build_object('driver_id', v_before), jsonb_build_object('driver_id', p_driver_id));
end $$;

create or replace function public.admin_rematch(p_order_id uuid, p_new_supplier_id uuid, p_expected_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders; a public.allocations; m record; v_old bigint; v_new bigint; v_drivers bigint; v_outcome text;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into o from public.orders x where x.id = p_order_id for update;
  select * into a from public.allocations x where x.order_id = o.id and x.status in ('offered', 'declined', 'accepted', 'ready') order by created_at limit 1 for update;
  if a.id is null then raise exception 'nothing to rematch' using errcode = 'P0001'; end if;
  select * into m from public.match_suppliers(o.id) x where x.supplier_id = p_new_supplier_id;
  if m.supplier_id is null or m.paused then raise exception 'supplier_unavailable' using errcode = 'P0001'; end if;
  v_old := a.supplier_price_cents::bigint * a.quantity;
  v_new := m.price_cents::bigint * a.quantity;
  select coalesce(sum(driver_share_cents), 0) into v_drivers from public.trips where allocation_id = a.id;
  v_outcome := case when v_new < v_old then 'cheaper_keep_price'
                    when o.total_cents - v_new - v_drivers >= 0 then 'absorb' else 'full_refund' end;
  if v_outcome is distinct from p_expected_outcome then raise exception 'outcome_changed:%', v_outcome using errcode = 'P0001'; end if;
  if v_outcome = 'full_refund' then
    perform public.admin_queue_refund(o.id, o.total_cents, null);
    update public.allocations set status = 'declined' where id = a.id;
  else
    update public.allocations set supplier_id = p_new_supplier_id, supplier_price_cents = m.price_cents,
           distance_km = m.distance_km, status = 'offered' where id = a.id;
  end if;
  perform public.log_audit('order.rematched', 'orders', o.id::text, jsonb_build_object('supplier_id', a.supplier_id),
    jsonb_build_object('supplier_id', p_new_supplier_id, 'outcome', v_outcome));
end $$;

create or replace function public.admin_cancel_orders(p_order_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  for r in select id from public.orders where id = any (p_order_ids) and status = 'placed' for update loop
    update public.orders set status = 'cancelled', cancelled_at = now() where id = r.id;
    update public.stock_reservations set status = 'released' where order_id = r.id and status = 'held';
    update public.payments set status = 'failed' where order_id = r.id and status = 'pending';
    perform public.log_order_event(r.id, 'cancelled', 'Cancelled by admin');
    perform public.log_audit('order.cancelled', 'orders', r.id::text, jsonb_build_object('status', 'placed'), jsonb_build_object('status', 'cancelled'));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.admin_set_document_status(p_document_id uuid, p_status public.document_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.documents set status = p_status, notes = p_note, reviewed_by = auth.uid(), reviewed_at = now() where id = p_document_id;
  if not found then raise exception 'document not found' using errcode = 'P0002'; end if;
  perform public.log_audit('document.' || p_status::text, 'documents', p_document_id::text, null, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_add_case_event(p_case_id uuid, p_kind public.case_event_kind, p_body text, p_visible_to_buyer boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  insert into public.case_events (case_id, actor_id, kind, body, visible_to_buyer) values (p_case_id, auth.uid(), p_kind, p_body, p_visible_to_buyer);
end $$;

create or replace function public.admin_advance_case(
  p_case_id uuid, p_status public.case_status, p_resolution public.case_resolution default null,
  p_amount_cents integer default null, p_cost_to public.case_cost_owner default null, p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.cases; ord text[] := array['open', 'in_review', 'awaiting_info', 'resolved', 'closed'];
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into c from public.cases x where x.id = p_case_id for update;
  if c.id is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  if array_position(ord, p_status::text) <= array_position(ord, c.status::text) then raise exception 'not_forward' using errcode = 'P0001'; end if;
  if p_status = 'resolved' and (p_resolution is null or p_cost_to is null
       or (p_resolution in ('refund', 'credit') and coalesce(p_amount_cents, 0) <= 0)) then
    raise exception 'invalid_resolution' using errcode = '22023';
  end if;
  update public.cases set status = p_status,
         resolution = case when p_status = 'resolved' then p_resolution else resolution end,
         amount_cents = case when p_status = 'resolved' then p_amount_cents else amount_cents end,
         cost_to = case when p_status = 'resolved' then p_cost_to else cost_to end,
         resolved_by = case when p_status = 'resolved' then auth.uid() else resolved_by end,
         resolved_at = case when p_status = 'resolved' then now() else resolved_at end
   where id = c.id;
  insert into public.case_events (case_id, actor_id, kind, body, visible_to_buyer)
  values (c.id, auth.uid(), 'status', coalesce(p_note, 'Status: ' || p_status::text), true);
  if p_status = 'resolved' and p_resolution = 'refund' and c.order_id is not null then
    perform public.admin_queue_refund(c.order_id, p_amount_cents, c.id);
  end if;
  perform public.log_audit('case.' || p_status::text, 'cases', c.id::text, jsonb_build_object('status', c.status), jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_retry_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update public.transfers set status = 'queued', next_attempt_at = null, bank_file_at = null where id = p_transfer_id and status = 'failed';
  if not found then raise exception 'not_failed' using errcode = 'P0001'; end if;
  perform public.log_audit('payout.retry_requested', 'transfers', p_transfer_id::text, null, null);
end $$;

-- grants
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in (
              'save_bank_details', 'get_bank_details_masked', 'decline_quote', 'request_custom_quote',
              'buyer_order_tracking', 'driver_confirm_pickup', 'driver_confirm_delivery', 'driver_trip_stops',
              'driver_pickup_info', 'driver_supplier_requirements', 'admin_assign_supplier', 'admin_schedule_order',
              'admin_assign_driver', 'admin_rematch', 'admin_cancel_orders', 'admin_set_document_status',
              'admin_add_case_event', 'admin_advance_case', 'admin_retry_transfer')
               or (p.proname = 'match_suppliers' and p.pronargs = 1)
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
