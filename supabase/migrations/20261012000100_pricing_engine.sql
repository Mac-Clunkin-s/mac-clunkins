-- McCluckin's — pricing engine, supplier matching, quotes, order creation, and the
-- scheduled housekeeping jobs (quote expiry, unpaid-order cancel, document expiry,
-- PDMA reconciliation).
--
-- Design rules, all deliberate:
--   * Money is integer cents. Rates are read from public.settings at call time and the
--     values used are snapshotted into quotes.breakdown, so a settings change affects
--     NEW quotes only and a stored quote is never recomputed.
--   * Buyers have no INSERT/UPDATE grant on quotes/orders (see the RLS migration). Every
--     write goes through the SECURITY DEFINER functions below, each with
--     `search_path = ''`, fully-qualified names and an explicit EXECUTE grant list.
--   * Anything a buyer can call returns only buyer-safe keys: never a supplier id, a
--     supplier price or a distance (a proxy for the farm location).
--   * Internal helpers (match, plan, audit, event writers) are not callable by
--     anon/authenticated at all; only other definer functions use them.
--   * Every status change, price change and payout writes order_events / audit_log.

-- ---------------------------------------------------------------------------
-- 0. New settings (data, not code). `on conflict do nothing` keeps any admin edit.
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, is_public, description) values
  ('rfq_quote_hours',          '24'::jsonb,    true,  'Hours an admin-sent quote (and its Paystack link) stays valid'),
  ('doc_expiry_warn_days',     '30'::jsonb,    false, 'Flag documents expiring within this many days'),
  ('road_distance_factor',     '1'::jsonb,     false, 'Multiplier from straight-line to road km (1 = no uplift)'),
  ('supplier_required_docs',   '["pdma","supplier_agreement"]'::jsonb, false, 'Document kinds a supplier must hold approved and unexpired to be matched'),
  ('driver_required_docs',     '[]'::jsonb,    false, 'Document kinds a driver must hold approved and unexpired to be matched'),
  ('paystack_card_pct',        '2.9'::jsonb,   false, 'Paystack local card fee, percent (excl. VAT)'),
  ('paystack_card_flat_cents', '100'::jsonb,   false, 'Paystack local card flat fee, cents (excl. VAT)'),
  ('paystack_vat_pct',         '15'::jsonb,    false, 'VAT charged on Paystack fees, percent'),
  ('paystack_transfer_fee_cents','300'::jsonb, false, 'Paystack transfer fee per transfer, cents (excl. VAT)'),
  ('payout_max_attempts',      '5'::jsonb,     false, 'Automatic transfer attempts before a payout waits for the bank-file fallback'),
  ('payout_retry_minutes',     '15'::jsonb,    false, 'Backoff step between transfer retries, minutes (multiplied by attempts)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------

-- Full price breakdown + settings snapshot + allocation plan. Not in the column grant
-- on quotes, so no client can read it; admins read it through admin_quotes-style RPCs.
alter table public.quotes add column if not exists breakdown jsonb;

-- Stock held for an open quote / unpaid order, so two buyers cannot take the same birds.
create table public.stock_reservations (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid references public.quotes (id) on delete cascade,
  order_id    uuid references public.orders (id) on delete cascade,
  supplier_id uuid not null references public.profiles (id) on delete cascade,
  bird_type   public.bird_type not null,
  week_start  date not null,
  quantity    integer not null check (quantity > 0),
  status      text not null default 'held' check (status in ('held', 'committed', 'released')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index stock_reservations_quote_id_idx    on public.stock_reservations (quote_id);
create index stock_reservations_order_id_idx    on public.stock_reservations (order_id);
create index stock_reservations_supplier_id_idx on public.stock_reservations (supplier_id, week_start, bird_type, status);

alter table public.stock_reservations enable row level security;   -- no policies: definer functions only
revoke all on public.stock_reservations from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Small internal helpers
-- ---------------------------------------------------------------------------

create or replace function public.app_setting(p_key text, p_default numeric default null)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v numeric;
begin
  select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end
    into v from public.settings s where s.key = p_key;
  v := coalesce(v, p_default);
  if v is null then
    raise exception 'setting % is not set', p_key using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Half-up rounding for non-negative amounts (Postgres round() on numeric is already
-- half-away-from-zero, but this states the intent and avoids float surprises).
create or replace function public.round_half_up(p_value numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$ select floor(p_value + 0.5)::bigint $$;

create or replace function public.log_audit(
  p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after)
$$;

create or replace function public.log_order_event(
  p_order_id uuid, p_status public.order_status, p_note text
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_events (order_id, status, actor_id, note)
  values (p_order_id, p_status, auth.uid(), p_note)
$$;

-- Does the profile hold every document kind listed in settings[p_setting_key] as
-- approved and unexpired? An empty or missing list means nothing is required.
create or replace function public.has_required_docs(p_profile_id uuid, p_setting_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1
    from public.settings s, jsonb_array_elements_text(s.value) k
    where s.key = p_setting_key
      and jsonb_typeof(s.value) = 'array'
      and not exists (
        select 1 from public.documents d
        where d.profile_id = p_profile_id
          and d.kind = k::public.document_kind
          and d.status = 'approved'
          and (d.expires_on is null or d.expires_on >= current_date)
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Price calculation (pure given settings; stable)
-- ---------------------------------------------------------------------------

-- p_allocations: [{supplier_id?, birds, price_cents, distance_km}, ...]. Each element is
-- one supplier slice = one vehicle trip = one delivery fee. The service fee is charged
-- once on (all birds + all delivery).
create or replace function public.calculate_quote_breakdown(p_allocations jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_markup_pct   numeric := public.app_setting('markup_pct');
  v_min_margin   numeric := public.app_setting('min_margin_cents');
  v_svc_pct      numeric := public.app_setting('service_fee_pct');
  v_base         numeric := public.app_setting('delivery_base_cents');
  v_per_km       numeric := public.app_setting('delivery_per_km_cents');
  v_per_bird     numeric := public.app_setting('delivery_per_bird_cents');
  v_driver_pct   numeric := public.app_setting('driver_share_pct');
  a              jsonb;
  v_price        bigint;
  v_birds        bigint;
  v_km           numeric;
  v_markup       bigint;
  v_margin       bigint;
  v_bird_price   bigint;
  v_delivery     bigint;
  v_driver       bigint;
  v_out          jsonb := '[]'::jsonb;
  v_birds_total  bigint := 0;
  v_delivery_tot bigint := 0;
  v_driver_tot   bigint := 0;
  v_supplier_tot bigint := 0;
  v_qty          bigint := 0;
  v_fee          bigint;
  v_max_km       numeric := 0;
begin
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'at least one allocation is required' using errcode = '22023';
  end if;

  for a in select * from jsonb_array_elements(p_allocations) loop
    v_price := (a ->> 'price_cents')::bigint;
    v_birds := (a ->> 'birds')::bigint;
    v_km    := coalesce((a ->> 'distance_km')::numeric, 0);
    if v_price is null or v_price < 0 or v_birds is null or v_birds <= 0 or v_km < 0 then
      raise exception 'invalid allocation %', a using errcode = '22023';
    end if;

    v_markup     := public.round_half_up(v_price * v_markup_pct / 100);
    v_margin     := greatest(v_markup, v_min_margin::bigint);   -- the floor wins when higher
    v_bird_price := v_price + v_margin;
    v_delivery   := public.round_half_up(v_base + v_km * v_per_km + v_birds * v_per_bird);
    v_driver     := public.round_half_up(v_delivery * v_driver_pct / 100);

    v_birds_total  := v_birds_total  + v_bird_price * v_birds;
    v_delivery_tot := v_delivery_tot + v_delivery;
    v_driver_tot   := v_driver_tot   + v_driver;
    v_supplier_tot := v_supplier_tot + v_price * v_birds;
    v_qty          := v_qty + v_birds;
    v_max_km       := greatest(v_max_km, v_km);

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'supplier_id',          a -> 'supplier_id',
      'birds',                v_birds,
      'distance_km',          v_km,
      'supplier_price_cents', v_price,
      'margin_cents',         v_margin,
      'bird_price_cents',     v_bird_price,
      'birds_total_cents',    v_bird_price * v_birds,
      'delivery_fee_cents',   v_delivery,
      'driver_share_cents',   v_driver,
      'supplier_total_cents', v_price * v_birds
    ));
  end loop;

  v_fee := public.round_half_up((v_birds_total + v_delivery_tot) * v_svc_pct / 100);

  return jsonb_build_object(
    'birds',                v_qty,
    'max_distance_km',      v_max_km,
    -- per-bird price shown to the buyer: exact for one slice, weighted average for a split
    'bird_price_cents',     public.round_half_up(v_birds_total::numeric / v_qty),
    'birds_total_cents',    v_birds_total,
    'delivery_fee_cents',   v_delivery_tot,
    'service_fee_cents',    v_fee,
    'total_cents',          v_birds_total + v_delivery_tot + v_fee,
    'driver_share_cents',   v_driver_tot,
    'supplier_total_cents', v_supplier_tot,
    'allocations',          v_out,
    'settings', jsonb_build_object(
      'markup_pct', v_markup_pct, 'min_margin_cents', v_min_margin,
      'service_fee_pct', v_svc_pct, 'delivery_base_cents', v_base,
      'delivery_per_km_cents', v_per_km, 'delivery_per_bird_cents', v_per_bird,
      'driver_share_pct', v_driver_pct)
  );
end;
$$;

-- Single-slice convenience wrapper: the shape of the Brief's worked example.
create or replace function public.calculate_price_breakdown(
  p_supplier_price_cents integer, p_birds integer, p_distance_km numeric
) returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.calculate_quote_breakdown(jsonb_build_array(jsonb_build_object(
    'price_cents', p_supplier_price_cents, 'birds', p_birds, 'distance_km', p_distance_km)))
$$;

-- What McCluckin's keeps on an order, after Paystack's own costs. Pure given settings.
create or replace function public.estimate_margin(
  p_total_cents integer, p_supplier_cents integer, p_driver_cents integer,
  p_transfer_count integer default 2
) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pct   numeric := public.app_setting('paystack_card_pct');
  v_flat  numeric := public.app_setting('paystack_card_flat_cents');
  v_vat   numeric := public.app_setting('paystack_vat_pct');
  v_tfee  numeric := public.app_setting('paystack_transfer_fee_cents');
  v_card  bigint;
  v_trans bigint;
begin
  v_card  := public.round_half_up((p_total_cents * v_pct / 100 + v_flat) * (1 + v_vat / 100));
  v_trans := public.round_half_up(p_transfer_count * v_tfee * (1 + v_vat / 100));
  return jsonb_build_object(
    'card_fee_cents', v_card,
    'transfer_fees_cents', v_trans,
    'mccluckins_keeps_cents', p_total_cents - p_supplier_cents - p_driver_cents - v_card - v_trans);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Matching
-- ---------------------------------------------------------------------------

-- Eligible suppliers for a bird type / band, ranked: same province first, then nearest,
-- then most stock, then cheapest landed price per bird, then best rating.
-- Excluded: not active, paused, controlled avian-flu zone, surveillance zone without an
-- approved unexpired movement permit, missing/expired required documents, inactive
-- prices, no location, no free stock, no vehicle that meets the supplier's requirements.
-- Internal: callable by service_role and by other definer functions only.
create or replace function public.match_suppliers(
  p_bird_type public.bird_type,
  p_weight_band public.weight_band,
  p_location extensions.geography,
  p_province text default null,
  p_week date default null
) returns table (
  supplier_id     uuid,
  price_cents     integer,
  min_order       integer,
  distance_km     numeric,
  same_province   boolean,
  stock_available integer,
  rating_avg      numeric,
  landed_cents    bigint,
  vehicle_capacity integer,
  rank            integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week   date    := coalesce(p_week, date_trunc('week', current_date)::date);
  v_factor numeric := public.app_setting('road_distance_factor', 1);
begin
  return query
  with cand as (
    select
      sd.profile_id as sid,
      sp.price_cents as price,
      sp.min_order as minq,
      round(extensions.st_distance(sd.location, p_location)::numeric / 1000 * v_factor, 2) as km,
      (p_province is not null and sd.province = p_province) as same_prov,
      (coalesce(st.birds_available, 0) - coalesce((
          select sum(r.quantity) from public.stock_reservations r
          where r.supplier_id = sd.profile_id and r.week_start = v_week
            and r.bird_type = p_bird_type and r.status = 'held'
            and (r.expires_at is null or r.expires_at > now())), 0))::integer as free_stock,
      sd.rating_avg as rating,
      (select max(dd.capacity_birds)
         from public.driver_details dd
         join public.profiles dp on dp.id = dd.profile_id and dp.role = 'driver' and dp.status = 'active'
         left join public.supplier_requirements sr on sr.supplier_id = sd.profile_id
        where not dd.paused and dd.capacity_birds is not null
          and (not coalesce(sr.covered_vehicle, true) or dd.covered)
          and public.has_required_docs(dd.profile_id, 'driver_required_docs')) as cap,
      public.round_half_up(
        sp.price_cents + greatest(
          sp.price_cents * public.app_setting('markup_pct') / 100,
          public.app_setting('min_margin_cents'))) as landed
    from public.supplier_details sd
    join public.profiles pr on pr.id = sd.profile_id and pr.role = 'supplier' and pr.status = 'active'
    join public.supplier_prices sp on sp.supplier_id = sd.profile_id
         and sp.bird_type = p_bird_type and sp.weight_band = p_weight_band and sp.active
    left join public.stock st on st.supplier_id = sd.profile_id
         and st.week_start = v_week and st.bird_type = p_bird_type
    where not sd.paused
      and sd.location is not null
      and (sd.avian_flu_zone = 'none'
           or (sd.avian_flu_zone = 'surveillance' and exists (
                 select 1 from public.documents d
                 where d.profile_id = sd.profile_id and d.kind = 'movement_permit'
                   and d.status = 'approved'
                   and (d.expires_on is null or d.expires_on >= current_date))))
      and public.has_required_docs(sd.profile_id, 'supplier_required_docs')
  )
  select c.sid, c.price, c.minq, c.km, c.same_prov, c.free_stock, c.rating, c.landed, c.cap,
         (row_number() over (
            order by c.same_prov desc, c.km asc, c.free_stock desc, c.landed asc,
                     c.rating desc nulls last, c.sid))::integer
  from cand c
  where c.free_stock >= greatest(c.minq, 1) and c.cap is not null
  order by 10;
end;
$$;

-- Greedy plan: walk the ranked suppliers, take what each can give (>= its minimum order),
-- and cut every supplier's share into chunks no larger than one eligible vehicle. Each
-- chunk becomes one allocation (one trip). Returns null when the order cannot be filled.
create or replace function public.plan_allocations(
  p_bird_type public.bird_type,
  p_weight_band public.weight_band,
  p_quantity integer,
  p_location extensions.geography,
  p_province text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r         record;
  v_left    integer := p_quantity;
  v_take    integer;
  v_chunk   integer;
  v_plan    jsonb := '[]'::jsonb;
begin
  for r in select * from public.match_suppliers(p_bird_type, p_weight_band, p_location, p_province) loop
    exit when v_left <= 0;
    v_take := least(v_left, r.stock_available);
    continue when v_take < r.min_order;
    v_left := v_left - v_take;
    while v_take > 0 loop
      v_chunk := least(v_take, r.vehicle_capacity);
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'supplier_id', r.supplier_id, 'birds', v_chunk,
        'price_cents', r.price_cents, 'distance_km', r.distance_km));
      v_take := v_take - v_chunk;
    end loop;
  end loop;
  if v_left > 0 then
    return null;
  end if;
  return v_plan;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Quotes
-- ---------------------------------------------------------------------------

-- Buyer-safe projection of a quote row: nothing about suppliers or distances.
create or replace function public.quote_buyer_view(p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'quote_id', q.id, 'kind', q.kind, 'status', q.status, 'bird_type', q.bird_type,
    'weight_band', q.weight_band, 'quantity', q.quantity,
    'bird_price_cents', q.bird_price_cents, 'delivery_fee_cents', q.delivery_fee_cents,
    'service_fee_cents', q.service_fee_cents, 'total_cents', q.total_cents,
    'expires_at', q.expires_at)
  from public.quotes q where q.id = p_quote_id
$$;

create or replace function public._assert_active_buyer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_role('buyer') then
    raise exception 'only an active buyer can request a quote' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.request_quote(
  p_address_id uuid, p_bird_type public.bird_type, p_weight_band public.weight_band,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := public._assert_active_buyer();
  v_min   integer := public.app_setting('min_order')::integer;
  v_id    uuid;
begin
  if p_quantity is null or p_quantity < v_min then
    raise exception 'minimum order is % birds', v_min using errcode = '22023';
  end if;
  if not exists (select 1 from public.addresses a where a.id = p_address_id and a.owner_id = v_buyer) then
    raise exception 'address not found' using errcode = 'P0002';
  end if;

  insert into public.quotes (buyer_id, address_id, bird_type, weight_band, quantity, kind, status)
  values (v_buyer, p_address_id, p_bird_type, p_weight_band, p_quantity, 'requested', 'open')
  returning id into v_id;

  perform public.log_audit('quote.requested', 'quotes', v_id::text, null,
    jsonb_build_object('quantity', p_quantity, 'bird_type', p_bird_type));
  return public.quote_buyer_view(v_id);
end;
$$;

-- Routing: instant when <= rfq_min_birds, <= rfq_max_km and the order can be filled from
-- eligible suppliers; otherwise a quote request for admin to price. The instant quote
-- is held for quote_hold_minutes and reserves the stock.
create or replace function public.create_instant_quote(
  p_address_id uuid, p_bird_type public.bird_type, p_weight_band public.weight_band,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer   uuid := public._assert_active_buyer();
  v_min     integer := public.app_setting('min_order')::integer;
  v_max_q   integer := public.app_setting('rfq_min_birds')::integer;
  v_max_km  numeric := public.app_setting('rfq_max_km');
  v_hold    numeric := public.app_setting('quote_hold_minutes');
  v_addr    public.addresses;
  v_plan    jsonb;
  v_bd      jsonb;
  v_id      uuid;
  v_week    date := date_trunc('week', current_date)::date;
  a         jsonb;
begin
  if p_quantity is null or p_quantity < v_min then
    raise exception 'minimum order is % birds', v_min using errcode = '22023';
  end if;
  select * into v_addr from public.addresses x where x.id = p_address_id and x.owner_id = v_buyer;
  if v_addr.id is null then
    raise exception 'address not found' using errcode = 'P0002';
  end if;

  if p_quantity > v_max_q or v_addr.location is null then
    return public.request_quote(p_address_id, p_bird_type, p_weight_band, p_quantity);
  end if;

  perform pg_advisory_xact_lock(hashtext('mc_stock_reserve'));   -- serialise stock reservation
  v_plan := public.plan_allocations(p_bird_type, p_weight_band, p_quantity, v_addr.location, v_addr.province);
  if v_plan is null then
    return public.request_quote(p_address_id, p_bird_type, p_weight_band, p_quantity);
  end if;
  v_bd := public.calculate_quote_breakdown(v_plan);
  if (v_bd ->> 'max_distance_km')::numeric > v_max_km then
    return public.request_quote(p_address_id, p_bird_type, p_weight_band, p_quantity);
  end if;

  insert into public.quotes (
    buyer_id, address_id, bird_type, weight_band, quantity, matched_supplier_id, distance_km,
    supplier_price_cents, bird_price_cents, delivery_fee_cents, service_fee_cents, total_cents,
    kind, status, expires_at, breakdown)
  values (
    v_buyer, p_address_id, p_bird_type, p_weight_band, p_quantity,
    (v_plan -> 0 ->> 'supplier_id')::uuid, (v_bd ->> 'max_distance_km')::numeric,
    (v_plan -> 0 ->> 'price_cents')::integer,
    (v_bd ->> 'bird_price_cents')::integer, (v_bd ->> 'delivery_fee_cents')::integer,
    (v_bd ->> 'service_fee_cents')::integer, (v_bd ->> 'total_cents')::integer,
    'instant', 'open', now() + make_interval(mins => v_hold::integer), v_bd)
  returning id into v_id;

  for a in select * from jsonb_array_elements(v_plan) loop
    insert into public.stock_reservations (quote_id, supplier_id, bird_type, week_start, quantity, expires_at)
    values (v_id, (a ->> 'supplier_id')::uuid, p_bird_type, v_week, (a ->> 'birds')::integer,
            now() + make_interval(mins => v_hold::integer));
  end loop;

  perform public.log_audit('quote.created', 'quotes', v_id::text, null,
    jsonb_build_object('kind', 'instant', 'total_cents', v_bd -> 'total_cents',
                       'settings', v_bd -> 'settings'));
  return public.quote_buyer_view(v_id);
end;
$$;

-- An expired quote is never revived; the buyer gets a fresh one at current prices.
create or replace function public.reprice_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := public._assert_active_buyer();
  q       public.quotes;
begin
  select * into q from public.quotes x where x.id = p_quote_id and x.buyer_id = v_buyer;
  if q.id is null then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status = 'accepted' then
    raise exception 'quote already accepted' using errcode = 'P0001';
  end if;
  if q.status = 'open' and (q.expires_at is null or q.expires_at > now()) then
    raise exception 'quote is still valid' using errcode = 'P0001';
  end if;
  return public.create_instant_quote(q.address_id, q.bird_type, q.weight_band, q.quantity);
end;
$$;

-- Admin prices a requested quote. p_allocations: [{supplier_id, birds, price_cents,
-- distance_km?}]; a missing distance is measured from the supplier to the buyer address.
create or replace function public.admin_price_quote(p_quote_id uuid, p_allocations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q       public.quotes;
  v_loc   extensions.geography;
  v_hours numeric := public.app_setting('rfq_quote_hours', 24);
  v_alloc jsonb := '[]'::jsonb;
  a       jsonb;
  v_km    numeric;
  v_bd    jsonb;
  v_sum   integer := 0;
begin
  if not public.is_admin() then
    raise exception 'only an admin can price a quote' using errcode = '42501';
  end if;
  select * into q from public.quotes x where x.id = p_quote_id for update;
  if q.id is null then raise exception 'quote not found' using errcode = 'P0002'; end if;
  if q.status <> 'open' then raise exception 'quote is %', q.status using errcode = 'P0001'; end if;
  select ad.location into v_loc from public.addresses ad where ad.id = q.address_id;

  for a in select * from jsonb_array_elements(p_allocations) loop
    v_km := (a ->> 'distance_km')::numeric;
    if v_km is null then
      select round(extensions.st_distance(sd.location, v_loc)::numeric / 1000
                   * public.app_setting('road_distance_factor', 1), 2)
        into v_km from public.supplier_details sd where sd.profile_id = (a ->> 'supplier_id')::uuid;
    end if;
    v_sum := v_sum + (a ->> 'birds')::integer;
    v_alloc := v_alloc || jsonb_build_array(jsonb_set(a, '{distance_km}', to_jsonb(coalesce(v_km, 0))));
  end loop;
  if v_sum <> q.quantity then
    raise exception 'allocations cover % birds, quote is for %', v_sum, q.quantity using errcode = '22023';
  end if;

  v_bd := public.calculate_quote_breakdown(v_alloc);
  update public.quotes set
    matched_supplier_id  = (v_alloc -> 0 ->> 'supplier_id')::uuid,
    distance_km          = (v_bd ->> 'max_distance_km')::numeric,
    supplier_price_cents = (v_alloc -> 0 ->> 'price_cents')::integer,
    bird_price_cents     = (v_bd ->> 'bird_price_cents')::integer,
    delivery_fee_cents   = (v_bd ->> 'delivery_fee_cents')::integer,
    service_fee_cents    = (v_bd ->> 'service_fee_cents')::integer,
    total_cents          = (v_bd ->> 'total_cents')::integer,
    expires_at           = now() + make_interval(hours => v_hours::integer),
    breakdown            = v_bd
  where id = p_quote_id;

  perform public.log_audit('quote.priced', 'quotes', p_quote_id::text, null,
    jsonb_build_object('total_cents', v_bd -> 'total_cents', 'settings', v_bd -> 'settings'));
  return public.quote_buyer_view(p_quote_id);
end;
$$;

create or replace function public.admin_match_preview(p_quote_id uuid)
returns table (supplier_id uuid, price_cents integer, distance_km numeric, same_province boolean,
               stock_available integer, rating_avg numeric, rank integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare q public.quotes; ad public.addresses;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into q from public.quotes x where x.id = p_quote_id;
  select * into ad from public.addresses x where x.id = q.address_id;
  return query
    select m.supplier_id, m.price_cents, m.distance_km, m.same_province, m.stock_available,
           m.rating_avg, m.rank
    from public.match_suppliers(q.bird_type, q.weight_band, ad.location, ad.province) m;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Quote -> order
-- ---------------------------------------------------------------------------

-- The buyer (or an admin, for a requested quote) turns an open, unexpired, priced quote
-- into an unpaid order. Allocations and trips are created later, when payment is verified.
create or replace function public.accept_quote_create_order(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q          public.quotes;
  v_is_admin boolean := public.is_admin();
  v_order    public.orders;
  v_unpaid   numeric := public.app_setting('unpaid_cancel_hours');
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into q from public.quotes x where x.id = p_quote_id for update;
  if q.id is null or not (v_is_admin or (q.buyer_id = auth.uid() and public.is_active_role('buyer'))) then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status = 'accepted' then
    select * into v_order from public.orders o where o.quote_id = q.id;
    return jsonb_build_object('order_id', v_order.id, 'number', v_order.number,
                              'total_cents', v_order.total_cents, 'status', v_order.status);
  end if;
  if q.status <> 'open' then
    raise exception 'quote_%', q.status using errcode = 'P0001';
  end if;
  if q.total_cents is null then
    raise exception 'quote_not_priced' using errcode = 'P0001';
  end if;
  if q.expires_at is not null and q.expires_at <= now() then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;

  insert into public.orders (
    quote_id, buyer_id, address_id, bird_type, weight_band, quantity,
    bird_price_cents, delivery_fee_cents, service_fee_cents, total_cents, status)
  values (
    q.id, q.buyer_id, q.address_id, q.bird_type, q.weight_band, q.quantity,
    q.bird_price_cents, q.delivery_fee_cents, q.service_fee_cents, q.total_cents, 'placed')
  returning * into v_order;

  update public.quotes set status = 'accepted' where id = q.id;
  -- Keep the stock held while the order waits for payment.
  update public.stock_reservations
     set order_id = v_order.id, expires_at = now() + make_interval(hours => v_unpaid::integer)
   where quote_id = q.id and status = 'held';

  perform public.log_order_event(v_order.id, 'placed', 'Order placed from quote');
  perform public.log_audit('order.created', 'orders', v_order.id::text, null,
    jsonb_build_object('number', v_order.number, 'total_cents', v_order.total_cents, 'quote_id', q.id));
  return jsonb_build_object('order_id', v_order.id, 'number', v_order.number,
                            'total_cents', v_order.total_cents, 'status', v_order.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Scheduled jobs (also callable by service_role)
-- ---------------------------------------------------------------------------

create or replace function public.expire_quotes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with e as (
    update public.quotes set status = 'expired'
     where status = 'open' and expires_at is not null and expires_at <= now()
    returning id)
  select array_agg(id) into v_ids from e;

  if v_ids is null then
    return 0;
  end if;
  -- Reservations still tied to an unaccepted quote go back to the pool.
  update public.stock_reservations set status = 'released'
   where quote_id = any (v_ids) and status = 'held' and order_id is null;
  perform public.log_audit('quote.expired', 'quotes', null, null, jsonb_build_object('quote_ids', v_ids));
  return array_length(v_ids, 1);
end;
$$;

create or replace function public.cancel_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours numeric := public.app_setting('unpaid_cancel_hours');
  r       record;
  n       integer := 0;
begin
  for r in
    select o.id, o.number from public.orders o
     where o.status = 'placed' and o.paid_at is null
       and o.placed_at <= now() - make_interval(hours => v_hours::integer)
     for update skip locked
  loop
    update public.orders set status = 'cancelled', cancelled_at = now() where id = r.id;
    update public.stock_reservations set status = 'released'
     where order_id = r.id and status = 'held';
    update public.payments set status = 'failed' where order_id = r.id and status = 'pending';
    perform public.log_order_event(r.id, 'cancelled', 'Unpaid after ' || v_hours || ' hours');
    perform public.log_audit('order.auto_cancelled', 'orders', r.id::text,
      jsonb_build_object('status', 'placed'), jsonb_build_object('status', 'cancelled'));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Documents expiring within doc_expiry_warn_days are flagged (one notification per
-- document per week); expired required documents pause the account.
create or replace function public.flag_expiring_documents()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days   integer := public.app_setting('doc_expiry_warn_days', 30)::integer;
  d        record;
  v_warned integer := 0;
  v_paused integer := 0;
begin
  for d in
    select doc.id, doc.profile_id, doc.kind, doc.expires_on, p.role, p.language
      from public.documents doc join public.profiles p on p.id = doc.profile_id
     where doc.status = 'approved' and doc.expires_on is not null
       and doc.expires_on >= current_date
       and doc.expires_on <= current_date + v_days
       and p.role in ('supplier', 'driver')
  loop
    if not exists (
      select 1 from public.notifications n
       where n.profile_id = d.profile_id and n.template = 'document_expiring'
         and n.payload ->> 'document_id' = d.id::text and n.created_at > now() - interval '7 days') then
      insert into public.notifications (profile_id, template, language, channel, payload)
      values (d.profile_id, 'document_expiring', d.language, 'email',
              jsonb_build_object('document_id', d.id, 'kind', d.kind, 'expires_on', d.expires_on));
      v_warned := v_warned + 1;
    end if;
  end loop;

  for d in
    select doc.id, doc.profile_id, doc.kind, p.role
      from public.documents doc join public.profiles p on p.id = doc.profile_id
     where doc.status = 'approved' and doc.expires_on < current_date and p.role in ('supplier', 'driver')
  loop
    if d.role = 'supplier' then
      update public.supplier_details set paused = true, paused_reason = 'Document expired: ' || d.kind::text
       where profile_id = d.profile_id and not (paused and paused_reason = 'Document expired: ' || d.kind::text);
    else
      update public.driver_details set paused = true, paused_reason = 'Document expired: ' || d.kind::text
       where profile_id = d.profile_id and not (paused and paused_reason = 'Document expired: ' || d.kind::text);
    end if;
    if found then
      perform public.log_audit('account.paused_document_expired', d.role::text || '_details',
        d.profile_id::text, null, jsonb_build_object('document_id', d.id, 'kind', d.kind));
      v_paused := v_paused + 1;
    end if;
  end loop;
  return jsonb_build_object('warned', v_warned, 'paused', v_paused);
end;
$$;

-- Monthly live-bird sales reconciliation for PDMA: one row per delivered order slice in
-- the month. Upserts the draft pdma_reports row and returns the CSV text; the caller
-- stores it in Storage and records file_path.
create or replace function public.generate_pdma_report(p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', coalesce(p_month, (current_date - interval '1 month')::date))::date;
  v_csv   text;
  v_rows  integer;
  v_birds integer;
begin
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with rows as (
    select o.number as order_number,
           (t.delivered_at at time zone 'Africa/Johannesburg')::date as delivered_on,
           coalesce(bp.business_name, bp.full_name) as buyer_business,
           bp.pdma_number as buyer_pdma,
           coalesce(t.delivered_count, a.quantity) as birds,
           o.bird_type::text as bird_type,
           coalesce(sd.pdma_number, sp.pdma_number) as supplier_pdma,
           case when bp.pdma_number is null and coalesce(t.delivered_count, a.quantity) > 5
                then 'BUYER_PDMA_MISSING' else '' end as flag
      from public.trips t
      join public.allocations a on a.id = t.allocation_id
      join public.orders o on o.id = a.order_id
      join public.profiles bp on bp.id = o.buyer_id
      left join public.supplier_details sd on sd.profile_id = a.supplier_id
      left join public.profiles sp on sp.id = a.supplier_id
     where t.status = 'delivered'
       and (t.delivered_at at time zone 'Africa/Johannesburg')::date >= v_month
       and (t.delivered_at at time zone 'Africa/Johannesburg')::date < (v_month + interval '1 month')::date
  )
  select count(*), coalesce(sum(birds), 0),
         'order_number,delivered_on,buyer,buyer_pdma_number,birds,bird_type,supplier_pdma_number,flag' || chr(10)
         || coalesce(string_agg(format('%s,%s,"%s",%s,%s,%s,%s,%s', order_number, delivered_on,
              replace(coalesce(buyer_business, ''), '"', '""'), coalesce(buyer_pdma, ''), birds,
              bird_type, coalesce(supplier_pdma, ''), flag), chr(10) order by delivered_on, order_number), '')
    into v_rows, v_birds, v_csv from rows;

  insert into public.pdma_reports (month, status, file_path)
  values (v_month, 'draft', 'pdma/' || to_char(v_month, 'YYYY-MM') || '.csv')
  on conflict (month) do update set file_path = excluded.file_path
    where public.pdma_reports.status = 'draft';

  perform public.log_audit('pdma.report_generated', 'pdma_reports', v_month::text, null,
    jsonb_build_object('rows', v_rows, 'birds', v_birds));
  return jsonb_build_object('month', v_month, 'rows', v_rows, 'birds', v_birds, 'csv', v_csv);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants: deny by default, then list exactly who may call what.
--    (Supabase grants new functions to anon/authenticated by default; revoke that.)
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('app_setting', 'round_half_up', 'log_audit', 'log_order_event',
         'has_required_docs', 'calculate_quote_breakdown', 'calculate_price_breakdown',
         'estimate_margin', 'match_suppliers', 'plan_allocations', 'quote_buyer_view',
         '_assert_active_buyer', 'request_quote', 'create_instant_quote', 'reprice_quote',
         'admin_price_quote', 'admin_match_preview', 'accept_quote_create_order',
         'expire_quotes', 'cancel_unpaid_orders', 'flag_expiring_documents',
         'generate_pdma_report')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$$;

-- Buyer / admin entry points
grant execute on function public.request_quote(uuid, public.bird_type, public.weight_band, integer) to authenticated;
grant execute on function public.create_instant_quote(uuid, public.bird_type, public.weight_band, integer) to authenticated;
grant execute on function public.reprice_quote(uuid) to authenticated;
grant execute on function public.accept_quote_create_order(uuid) to authenticated;
grant execute on function public.admin_price_quote(uuid, jsonb) to authenticated;       -- is_admin() inside
grant execute on function public.admin_match_preview(uuid) to authenticated;            -- is_admin() inside
-- Scheduled jobs and server-side use
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.expire_quotes(), public.cancel_unpaid_orders(),
      public.flag_expiring_documents(), public.generate_pdma_report(date),
      public.match_suppliers(public.bird_type, public.weight_band, extensions.geography, text, date),
      public.plan_allocations(public.bird_type, public.weight_band, integer, extensions.geography, text),
      public.estimate_margin(integer, integer, integer, integer),
      public.calculate_quote_breakdown(jsonb),
      public.calculate_price_breakdown(integer, integer, numeric)
      to service_role;
  end if;
end
$$;
