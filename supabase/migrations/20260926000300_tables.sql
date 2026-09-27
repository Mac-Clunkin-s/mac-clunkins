-- McCluckin's — the 26 tables from the Brief's Database section.
--
-- Conventions, all of them deliberate:
--   * every money column is `integer` cents named `*_cents`. No numeric, no float.
--   * every timestamp is `timestamptz`. Application timezone is Africa/Johannesburg.
--   * every foreign-key column carries an index; PostGIS point columns carry a GIST index.
--   * an order (what the buyer sees) -> many allocations (supplier jobs) -> one trip each
--     (driver job). That split is what lets each role read only its own rows.

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------

create table public.provinces (
  code        text primary key,
  name        text not null,
  active      boolean not null default true
);

create table public.areas_served (
  province     text primary key references public.provinces (code) on delete restrict,
  active       boolean not null default false,
  launch_order integer
);

create table public.delivery_slots (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  start_time time not null,
  end_time   time not null,
  active     boolean not null default true,
  constraint delivery_slots_span_check check (end_time > start_time)
);

-- `value` is jsonb so a rate, a percentage and an undecided null all live in one table.
-- `is_public` is the allowlist behind the "public keys to everyone" rule in RLS.
create table public.settings (
  key         text primary key,
  value       jsonb,
  is_public   boolean not null default false,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.user_role not null,
  status        public.profile_status not null default 'pending',
  full_name     text not null,
  business_name text,
  business_type public.business_type,
  whatsapp_phone text,
  email         text,
  language      public.app_language not null default 'en',
  pdma_number   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index profiles_role_status_idx on public.profiles (role, status);
create index profiles_whatsapp_phone_idx on public.profiles (whatsapp_phone);

create table public.addresses (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  label      text,
  street     text not null,
  town       text not null,
  province   text references public.provinces (code) on delete set null,
  location   extensions.geography(Point, 4326),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_owner_id_idx on public.addresses (owner_id);
create index addresses_province_idx on public.addresses (province);
create index addresses_location_gix on public.addresses using gist (location);

create table public.supplier_details (
  profile_id              uuid primary key references public.profiles (id) on delete cascade,
  farm_name               text,
  pickup_address          text,
  location                extensions.geography(Point, 4326),
  province                text references public.provinces (code) on delete set null,
  pdma_number             text,
  avian_flu_zone          public.avian_flu_zone not null default 'none',
  paused                  boolean not null default true,
  paused_reason           text,
  -- Encrypted at rest before any real bank detail is captured (Phase 4). Null in Phase 1.
  bank_details_encrypted  bytea,
  paystack_recipient_code text,
  rating_avg              numeric(3,2),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index supplier_details_province_idx on public.supplier_details (province);
create index supplier_details_location_gix on public.supplier_details using gist (location);

create table public.supplier_prices (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.profiles (id) on delete cascade,
  bird_type   public.bird_type not null,
  weight_band public.weight_band not null,
  price_cents integer not null check (price_cents >= 0),
  min_order   integer not null default 10 check (min_order > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (supplier_id, bird_type, weight_band)
);
create index supplier_prices_supplier_id_idx on public.supplier_prices (supplier_id);
create index supplier_prices_lookup_idx on public.supplier_prices (bird_type, weight_band, active);

create table public.supplier_requirements (
  supplier_id             uuid primary key references public.profiles (id) on delete cascade,
  crate_spec              text,
  max_per_crate           integer check (max_per_crate > 0),
  max_per_crate_hot       integer check (max_per_crate_hot > 0),
  covered_vehicle         boolean not null default true,
  loading_window          text,
  collection_point        text,
  disinfection_photo      boolean not null default true,
  no_other_farm_same_day  boolean not null default false,
  max_journey_hours       numeric(4,1),
  updated_at              timestamptz not null default now()
);

create table public.stock (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.profiles (id) on delete cascade,
  week_start      date not null,
  bird_type       public.bird_type not null,
  birds_available integer not null default 0 check (birds_available >= 0),
  avg_weight_kg   numeric(4,2),
  load_days       text[],
  updated_at      timestamptz not null default now(),
  unique (supplier_id, week_start, bird_type)
);
create index stock_supplier_id_idx on public.stock (supplier_id);
create index stock_week_start_idx on public.stock (week_start);

create table public.driver_details (
  profile_id              uuid primary key references public.profiles (id) on delete cascade,
  vehicle_type            public.vehicle_type,
  gvm_kg                  integer check (gvm_kg > 0),
  vehicle_reg             text,
  covered                 boolean not null default false,
  ventilated              boolean not null default false,
  crates_owned            integer default 0 check (crates_owned >= 0),
  capacity_birds          integer check (capacity_birds > 0),
  licence_code            text,
  prdp                    boolean not null default false,
  operator_card           boolean not null default false,
  insurance               boolean not null default false,
  paused                  boolean not null default true,
  paused_reason           text,
  -- Encrypted at rest before any real bank detail is captured (Phase 4). Null in Phase 1.
  bank_details_encrypted  bytea,
  paystack_recipient_code text,
  rating_avg              numeric(3,2),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  kind        public.document_kind not null,
  file_path   text,
  status      public.document_status not null default 'missing',
  expires_on  date,
  notes       text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index documents_profile_id_idx on public.documents (profile_id);
create index documents_reviewed_by_idx on public.documents (reviewed_by);
create index documents_status_idx on public.documents (status);
create index documents_expires_on_idx on public.documents (expires_on);

-- ---------------------------------------------------------------------------
-- Ordering
-- ---------------------------------------------------------------------------

-- Every quote stores the prices it was quoted at. Nothing here is ever recomputed
-- from current settings.
create table public.quotes (
  id                    uuid primary key default gen_random_uuid(),
  buyer_id              uuid not null references public.profiles (id) on delete cascade,
  address_id            uuid references public.addresses (id) on delete set null,
  bird_type             public.bird_type not null,
  weight_band           public.weight_band not null,
  quantity              integer not null check (quantity > 0),
  matched_supplier_id   uuid references public.profiles (id) on delete set null,
  distance_km           numeric(7,2),
  supplier_price_cents  integer check (supplier_price_cents >= 0),
  bird_price_cents      integer check (bird_price_cents >= 0),
  delivery_fee_cents    integer check (delivery_fee_cents >= 0),
  service_fee_cents     integer check (service_fee_cents >= 0),
  total_cents           integer check (total_cents >= 0),
  kind                  public.quote_kind not null default 'instant',
  status                public.quote_status not null default 'open',
  expires_at            timestamptz,
  paystack_payment_link text,
  created_at            timestamptz not null default now()
);
create index quotes_buyer_id_idx on public.quotes (buyer_id);
create index quotes_address_id_idx on public.quotes (address_id);
create index quotes_matched_supplier_id_idx on public.quotes (matched_supplier_id);
create index quotes_status_expires_at_idx on public.quotes (status, expires_at);

-- `number` is MC-0001 style, generated server-side by a trigger (see numbering migration).
create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  number             text not null unique,
  quote_id           uuid references public.quotes (id) on delete set null,
  buyer_id           uuid not null references public.profiles (id) on delete restrict,
  address_id         uuid references public.addresses (id) on delete set null,
  bird_type          public.bird_type not null,
  weight_band        public.weight_band not null,
  quantity           integer not null check (quantity > 0),
  bird_price_cents   integer not null check (bird_price_cents >= 0),
  delivery_fee_cents integer not null check (delivery_fee_cents >= 0),
  service_fee_cents  integer not null check (service_fee_cents >= 0),
  total_cents        integer not null check (total_cents >= 0),
  status             public.order_status not null default 'placed',
  delivery_date      date,
  slot_id            uuid references public.delivery_slots (id) on delete set null,
  delivery_code      text,
  placed_at          timestamptz not null default now(),
  paid_at            timestamptz,
  cancelled_at       timestamptz
);
create index orders_buyer_id_idx on public.orders (buyer_id);
create index orders_quote_id_idx on public.orders (quote_id);
create index orders_address_id_idx on public.orders (address_id);
create index orders_slot_id_idx on public.orders (slot_id);
create index orders_status_idx on public.orders (status);
create index orders_delivery_date_idx on public.orders (delivery_date);

-- The supplier's slice of an order. Large orders split across several allocations.
create table public.allocations (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  supplier_id          uuid not null references public.profiles (id) on delete restrict,
  quantity             integer not null check (quantity > 0),
  supplier_price_cents integer not null check (supplier_price_cents >= 0),
  distance_km          numeric(7,2),
  status               public.allocation_status not null default 'offered',
  pickup_at            timestamptz,
  birds_counted        integer check (birds_counted >= 0),
  crates               integer check (crates >= 0),
  welfare_ok           boolean,
  load_photo_path      text,
  removal_permit_path  text,
  permit_valid_until   timestamptz,
  crosses_province     boolean not null default false,
  movement_permit_path text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index allocations_order_id_idx on public.allocations (order_id);
create index allocations_supplier_id_idx on public.allocations (supplier_id);
create index allocations_status_idx on public.allocations (status);

-- The driver's slice. `delivery_fee_cents` is the full fee (admin's number);
-- `driver_share_cents` is what the driver is paid and the only one they may read.
create table public.trips (
  id                       uuid primary key default gen_random_uuid(),
  allocation_id            uuid not null unique references public.allocations (id) on delete cascade,
  driver_id                uuid references public.profiles (id) on delete set null,
  delivery_fee_cents       integer not null default 0 check (delivery_fee_cents >= 0),
  driver_share_cents       integer not null default 0 check (driver_share_cents >= 0),
  status                   public.trip_status not null default 'assigned',
  pickup_count             integer check (pickup_count >= 0),
  disinfection_photo_path  text,
  forecast_temp_c          numeric(4,1),
  picked_up_at             timestamptz,
  delivered_count          integer check (delivered_count >= 0),
  delivered_at             timestamptz,
  pod_photo_path           text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index trips_driver_id_idx on public.trips (driver_id);
create index trips_status_idx on public.trips (status);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  paystack_reference text unique,
  channel            public.payment_channel,
  amount_cents       integer not null check (amount_cents >= 0),
  fee_cents          integer check (fee_cents >= 0),
  status             public.payment_status not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index payments_order_id_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status);

-- Exactly one of allocation_id / trip_id is set, matching party_type.
create table public.transfers (
  id                     uuid primary key default gen_random_uuid(),
  party_id               uuid not null references public.profiles (id) on delete restrict,
  party_type             public.party_type not null,
  allocation_id          uuid references public.allocations (id) on delete set null,
  trip_id                uuid references public.trips (id) on delete set null,
  amount_cents           integer not null check (amount_cents >= 0),
  paystack_transfer_code text,
  status                 public.transfer_status not null default 'queued',
  failure_reason         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint transfers_party_target_check check (
    (party_type = 'supplier' and allocation_id is not null and trip_id is null)
    or (party_type = 'driver' and trip_id is not null and allocation_id is null)
  )
);
create index transfers_party_id_idx on public.transfers (party_id);
create index transfers_allocation_id_idx on public.transfers (allocation_id);
create index transfers_trip_id_idx on public.transfers (trip_id);
create index transfers_status_idx on public.transfers (status);

create table public.refunds (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  case_id           uuid,
  amount_cents      integer not null check (amount_cents >= 0),
  paystack_refund_id text,
  status            public.refund_status not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index refunds_order_id_idx on public.refunds (order_id);
create index refunds_case_id_idx on public.refunds (case_id);

-- ---------------------------------------------------------------------------
-- Problems, feedback, history
-- ---------------------------------------------------------------------------

-- `number` is CASE-2026-00001 style, generated server-side by a trigger.
create table public.cases (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  order_id       uuid references public.orders (id) on delete set null,
  raised_by      uuid not null references public.profiles (id) on delete restrict,
  type           public.case_type not null,
  birds_affected integer check (birds_affected >= 0),
  description    text,
  photo_paths    text[],
  status         public.case_status not null default 'open',
  resolution     public.case_resolution,
  amount_cents   integer check (amount_cents >= 0),
  cost_to        public.case_cost_owner,
  reply_due_at   timestamptz,
  resolved_by    uuid references public.profiles (id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index cases_order_id_idx on public.cases (order_id);
create index cases_raised_by_idx on public.cases (raised_by);
create index cases_resolved_by_idx on public.cases (resolved_by);
create index cases_status_idx on public.cases (status);

alter table public.refunds
  add constraint refunds_case_id_fkey foreign key (case_id)
  references public.cases (id) on delete set null;

create table public.case_events (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references public.cases (id) on delete cascade,
  actor_id         uuid references public.profiles (id) on delete set null,
  kind             public.case_event_kind not null,
  body             text,
  visible_to_buyer boolean not null default false,
  created_at       timestamptz not null default now()
);
create index case_events_case_id_idx on public.case_events (case_id);
create index case_events_actor_id_idx on public.case_events (actor_id);

create table public.ratings (
  order_id   uuid primary key references public.orders (id) on delete cascade,
  thumbs     public.rating_thumbs not null,
  comment    text,
  created_at timestamptz not null default now()
);

create table public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  status     public.order_status not null,
  actor_id   uuid references public.profiles (id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);
create index order_events_order_id_idx on public.order_events (order_id);
create index order_events_actor_id_idx on public.order_events (actor_id);

create table public.pdma_reports (
  id           uuid primary key default gen_random_uuid(),
  month        date not null unique,
  status       public.pdma_report_status not null default 'draft',
  file_path    text,
  submitted_at timestamptz,
  created_at   timestamptz not null default now()
);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  template      text not null,
  language      public.app_language not null default 'en',
  channel       public.notification_channel not null,
  status        public.notification_status not null default 'queued',
  payload       jsonb,
  failure_reason text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_profile_id_idx on public.notifications (profile_id);
create index notifications_status_idx on public.notifications (status);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_actor_id_idx on public.audit_log (actor_id);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
