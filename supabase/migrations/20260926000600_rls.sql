-- McCluckin's — row-level security on all 26 tables.
--
-- This file is the privacy boundary. Buyers, suppliers and drivers never see each
-- other's identities, prices or contact details, and that is true because of what is
-- below, not because of anything in React.
--
-- Two mechanisms, used for two different jobs:
--
--   ROWS    -> RLS policies. Which rows of a table a caller may see at all.
--   COLUMNS -> column-level GRANT SELECT. Which columns of a visible row exist for
--              the `authenticated` role. Used on quotes, allocations and trips, where
--              a role must see part of a row and not the rest.
--
-- Why column grants rather than views for the sensitive direction: a view can be
-- side-stepped by querying the base table, and PostgREST will happily do that if a
-- client asks. A column grant is enforced by the privilege system on every path into
-- the table — REST, RPC, a join, a CTE — and it fails loudly rather than silently
-- returning the column. Admins, who share the `authenticated` database role with
-- everyone else and therefore cannot be given extra columns by grant, read the
-- withheld columns through the owner-privileged `admin_*` views in the next
-- migration, each guarded by `is_admin()`.
--
-- Default posture: revoke everything, then grant exactly what a role needs.
-- `anon` gets a grant on the four public-by-design tables and nothing else, so an
-- anonymous read of any other table is refused at the privilege layer before RLS is
-- even consulted.

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on all 26 tables
-- ---------------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.addresses             enable row level security;
alter table public.provinces             enable row level security;
alter table public.supplier_details      enable row level security;
alter table public.supplier_prices       enable row level security;
alter table public.supplier_requirements enable row level security;
alter table public.stock                 enable row level security;
alter table public.driver_details        enable row level security;
alter table public.documents             enable row level security;
alter table public.delivery_slots        enable row level security;
alter table public.quotes                enable row level security;
alter table public.orders                enable row level security;
alter table public.allocations           enable row level security;
alter table public.trips                 enable row level security;
alter table public.payments              enable row level security;
alter table public.transfers             enable row level security;
alter table public.refunds               enable row level security;
alter table public.cases                 enable row level security;
alter table public.case_events           enable row level security;
alter table public.ratings               enable row level security;
alter table public.order_events          enable row level security;
alter table public.pdma_reports          enable row level security;
alter table public.notifications         enable row level security;
alter table public.audit_log             enable row level security;
alter table public.settings              enable row level security;
alter table public.areas_served          enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Strip default privileges
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Public reference data — everyone, signed in or not
-- ---------------------------------------------------------------------------

grant select on public.provinces      to anon, authenticated;
grant select on public.delivery_slots to anon, authenticated;
grant select on public.areas_served   to anon, authenticated;

create policy provinces_read_all on public.provinces
  for select to anon, authenticated using (true);
create policy delivery_slots_read_all on public.delivery_slots
  for select to anon, authenticated using (true);
create policy areas_served_read_all on public.areas_served
  for select to anon, authenticated using (true);

-- settings: admins read every key; everyone reads only the keys flagged public.
-- `updated_by` is withheld from clients so a settings row cannot leak an admin's id.
grant select (key, value, description) on public.settings to anon, authenticated;

create policy settings_read_public on public.settings
  for select to anon, authenticated using (is_public);
create policy settings_admin_read on public.settings
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. profiles — own row; admin all
-- ---------------------------------------------------------------------------

grant select on public.profiles to authenticated;
-- Column-scoped UPDATE: `role` and `status` are absent, so no signed-in user can
-- promote or activate themselves even with a hand-crafted request. Approval goes
-- through public.set_profile_status(), which is audited.
grant update (full_name, business_name, business_type, whatsapp_phone, email, language, pdma_number)
  on public.profiles to authenticated;

create policy profiles_read_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_admin_read on public.profiles
  for select to authenticated using (public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. addresses — owner; admin; a driver only for trips assigned to them
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.addresses to authenticated;

create policy addresses_read_own on public.addresses
  for select to authenticated using (owner_id = auth.uid());
create policy addresses_admin_read on public.addresses
  for select to authenticated using (public.is_admin());
create policy addresses_driver_read_assigned on public.addresses
  for select to authenticated
  using (public.is_active_role('driver') and public.driver_can_read_address(id));

create policy addresses_insert_own on public.addresses
  for insert to authenticated with check (owner_id = auth.uid());
create policy addresses_update_own on public.addresses
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy addresses_delete_own on public.addresses
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Supplier-owned tables — own rows; admin
-- ---------------------------------------------------------------------------

grant select, insert, update on public.supplier_details to authenticated;
-- Bank details are write-blocked for now: the columns exist, stay null, and are only
-- filled once they are encrypted at rest (Phase 4). `paystack_recipient_code` is set
-- by an Edge Function, never by the browser.

create policy supplier_details_read_own on public.supplier_details
  for select to authenticated using (profile_id = auth.uid());
create policy supplier_details_admin_read on public.supplier_details
  for select to authenticated using (public.is_admin());
create policy supplier_details_insert_own on public.supplier_details
  for insert to authenticated
  with check (profile_id = auth.uid() and public.current_profile_role() = 'supplier');
create policy supplier_details_update_own on public.supplier_details
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, insert, update, delete on public.supplier_prices to authenticated;

-- Never a buyer. There is no buyer-facing policy on this table at all, so a buyer's
-- query matches nothing and returns zero rows.
create policy supplier_prices_read_own on public.supplier_prices
  for select to authenticated
  using (supplier_id = auth.uid() and public.is_active_role('supplier'));
create policy supplier_prices_admin_read on public.supplier_prices
  for select to authenticated using (public.is_admin());
create policy supplier_prices_write_own on public.supplier_prices
  for insert to authenticated
  with check (supplier_id = auth.uid() and public.is_active_role('supplier'));
create policy supplier_prices_update_own on public.supplier_prices
  for update to authenticated
  using (supplier_id = auth.uid() and public.is_active_role('supplier'))
  with check (supplier_id = auth.uid());
create policy supplier_prices_delete_own on public.supplier_prices
  for delete to authenticated
  using (supplier_id = auth.uid() and public.is_active_role('supplier'));

grant select, insert, update on public.supplier_requirements to authenticated;

create policy supplier_requirements_read_own on public.supplier_requirements
  for select to authenticated using (supplier_id = auth.uid());
create policy supplier_requirements_admin_read on public.supplier_requirements
  for select to authenticated using (public.is_admin());
-- A driver assigned to collect from this supplier needs the crate and vehicle rules.
create policy supplier_requirements_driver_read on public.supplier_requirements
  for select to authenticated
  using (public.is_active_role('driver') and public.driver_matched_to_supplier(supplier_id));
create policy supplier_requirements_insert_own on public.supplier_requirements
  for insert to authenticated
  with check (supplier_id = auth.uid() and public.is_active_role('supplier'));
create policy supplier_requirements_update_own on public.supplier_requirements
  for update to authenticated
  using (supplier_id = auth.uid() and public.is_active_role('supplier'))
  with check (supplier_id = auth.uid());

grant select, insert, update, delete on public.stock to authenticated;

create policy stock_read_own on public.stock
  for select to authenticated
  using (supplier_id = auth.uid() and public.is_active_role('supplier'));
create policy stock_admin_read on public.stock
  for select to authenticated using (public.is_admin());
create policy stock_insert_own on public.stock
  for insert to authenticated
  with check (supplier_id = auth.uid() and public.is_active_role('supplier'));
create policy stock_update_own on public.stock
  for update to authenticated
  using (supplier_id = auth.uid() and public.is_active_role('supplier'))
  with check (supplier_id = auth.uid());
create policy stock_delete_own on public.stock
  for delete to authenticated
  using (supplier_id = auth.uid() and public.is_active_role('supplier'));

-- ---------------------------------------------------------------------------
-- 7. driver_details — own row; admin
-- ---------------------------------------------------------------------------

grant select, insert, update on public.driver_details to authenticated;

create policy driver_details_read_own on public.driver_details
  for select to authenticated using (profile_id = auth.uid());
create policy driver_details_admin_read on public.driver_details
  for select to authenticated using (public.is_admin());
create policy driver_details_insert_own on public.driver_details
  for insert to authenticated
  with check (profile_id = auth.uid() and public.current_profile_role() = 'driver');
create policy driver_details_update_own on public.driver_details
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. documents — own rows; admin
-- ---------------------------------------------------------------------------

grant select, insert on public.documents to authenticated;
-- A user may replace their own upload but never its review verdict, so `status`,
-- `reviewed_by` and `reviewed_at` are outside the UPDATE grant.
grant update (file_path, expires_on) on public.documents to authenticated;

create policy documents_read_own on public.documents
  for select to authenticated using (profile_id = auth.uid());
create policy documents_admin_read on public.documents
  for select to authenticated using (public.is_admin());
create policy documents_insert_own on public.documents
  for insert to authenticated with check (profile_id = auth.uid());
create policy documents_update_own on public.documents
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9. quotes — owning buyer, without the supplier fields; admin
-- ---------------------------------------------------------------------------

-- Column grant is the boundary: matched_supplier_id, supplier_price_cents and
-- distance_km are simply not selectable by any `authenticated` client. distance_km is
-- withheld because it is a proxy for the supplier's location.
grant select (
  id, buyer_id, address_id, bird_type, weight_band, quantity,
  bird_price_cents, delivery_fee_cents, service_fee_cents, total_cents,
  kind, status, expires_at, paystack_payment_link, created_at
) on public.quotes to authenticated;

create policy quotes_read_own on public.quotes
  for select to authenticated
  using (buyer_id = auth.uid() and public.is_active_role('buyer'));
create policy quotes_admin_read on public.quotes
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 10. orders — the owning buyer; admin
-- ---------------------------------------------------------------------------

-- The Brief's `orders` carries no supplier or driver-pay column by design: the
-- supplier's price lives on `allocations` and the driver's share on `trips`, each
-- behind its own RLS. So "orders without supplier or driver-pay fields" is satisfied
-- structurally, and a full-row grant here leaks nothing.
grant select on public.orders to authenticated;

create policy orders_read_own on public.orders
  for select to authenticated
  using (buyer_id = auth.uid() and public.is_active_role('buyer'));
create policy orders_admin_read on public.orders
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 11. allocations — the assigned supplier; admin
-- ---------------------------------------------------------------------------

-- No buyer fields exist on this table. `distance_km` is withheld from clients because
-- it narrows down where the buyer is.
grant select (
  id, order_id, supplier_id, quantity, supplier_price_cents, status, pickup_at,
  birds_counted, crates, welfare_ok, load_photo_path, removal_permit_path,
  permit_valid_until, crosses_province, movement_permit_path, created_at, updated_at
) on public.allocations to authenticated;

create policy allocations_read_own on public.allocations
  for select to authenticated
  using (supplier_id = auth.uid() and public.is_active_role('supplier'));
create policy allocations_admin_read on public.allocations
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 12. trips — the assigned driver; admin
-- ---------------------------------------------------------------------------

-- `delivery_fee_cents` is the full customer-facing fee and is withheld: the driver
-- sees `driver_share_cents`, their own fee, and no other price anywhere in the system.
grant select (
  id, allocation_id, driver_id, driver_share_cents, status, pickup_count,
  disinfection_photo_path, forecast_temp_c, picked_up_at, delivered_count,
  delivered_at, pod_photo_path, created_at, updated_at
) on public.trips to authenticated;

create policy trips_read_own on public.trips
  for select to authenticated
  using (driver_id = auth.uid() and public.is_active_role('driver'));
create policy trips_admin_read on public.trips
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 13. Money tables
-- ---------------------------------------------------------------------------

grant select on public.payments to authenticated;
create policy payments_read_own_order on public.payments
  for select to authenticated
  using (public.is_active_role('buyer') and public.buyer_owns_order(order_id));
create policy payments_admin_read on public.payments
  for select to authenticated using (public.is_admin());

grant select on public.transfers to authenticated;
create policy transfers_read_own on public.transfers
  for select to authenticated using (party_id = auth.uid());
create policy transfers_admin_read on public.transfers
  for select to authenticated using (public.is_admin());

grant select on public.refunds to authenticated;
create policy refunds_read_own_order on public.refunds
  for select to authenticated
  using (public.is_active_role('buyer') and public.buyer_owns_order(order_id));
create policy refunds_admin_read on public.refunds
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 14. Cases, ratings, order history
-- ---------------------------------------------------------------------------

grant select, insert on public.cases to authenticated;
create policy cases_read_own on public.cases
  for select to authenticated using (raised_by = auth.uid());
create policy cases_admin_read on public.cases
  for select to authenticated using (public.is_admin());
create policy cases_insert_own on public.cases
  for insert to authenticated with check (raised_by = auth.uid());

grant select, insert on public.case_events to authenticated;
-- The raiser sees only the events marked visible to them; internal notes stay internal.
create policy case_events_read_visible on public.case_events
  for select to authenticated
  using (
    visible_to_buyer
    and exists (select 1 from public.cases c where c.id = case_id and c.raised_by = auth.uid())
  );
create policy case_events_admin_read on public.case_events
  for select to authenticated using (public.is_admin());
create policy case_events_insert_own on public.case_events
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (select 1 from public.cases c where c.id = case_id and c.raised_by = auth.uid())
  );

grant select, insert, update on public.ratings to authenticated;
create policy ratings_read_own on public.ratings
  for select to authenticated
  using (public.is_active_role('buyer') and public.buyer_owns_order(order_id));
create policy ratings_admin_read on public.ratings
  for select to authenticated using (public.is_admin());
create policy ratings_insert_own on public.ratings
  for insert to authenticated with check (public.buyer_owns_order(order_id));
create policy ratings_update_own on public.ratings
  for update to authenticated
  using (public.buyer_owns_order(order_id)) with check (public.buyer_owns_order(order_id));

-- order_events: same audience as the order. Written only by the status-transition
-- functions, so there is no client INSERT grant.
grant select on public.order_events to authenticated;
create policy order_events_read_own_order on public.order_events
  for select to authenticated
  using (public.is_active_role('buyer') and public.buyer_owns_order(order_id));
create policy order_events_admin_read on public.order_events
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 15. notifications — own rows; admin
-- ---------------------------------------------------------------------------

grant select on public.notifications to authenticated;
create policy notifications_read_own on public.notifications
  for select to authenticated using (profile_id = auth.uid());
create policy notifications_admin_read on public.notifications
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16. Admin-only tables
-- ---------------------------------------------------------------------------

-- audit_log is readable by admins and writable by nobody through the API: every row
-- comes from a security definer function, so the trail cannot be forged or edited.
grant select on public.audit_log to authenticated;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

grant select on public.pdma_reports to authenticated;
create policy pdma_reports_admin_read on public.pdma_reports
  for select to authenticated using (public.is_admin());
