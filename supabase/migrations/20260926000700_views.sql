-- McCluckin's — read views.
--
-- Two kinds, and the difference matters:
--
-- 1. Role-facing views (`buyer_quotes`, `supplier_allocations`, `driver_trips`) are
--    `security_invoker = true`. They run with the caller's own privileges, so the
--    column grants and RLS policies from the previous migration still apply in full.
--    They exist purely so the client can write `select *` instead of enumerating the
--    permitted columns by hand. They cannot widen anything.
--
-- 2. Admin views (`admin_quotes`, `admin_allocations`, `admin_trips`) are
--    `security_invoker = false`, so they run as the view owner and can read the
--    columns that the `authenticated` role was not granted. They are the *only*
--    reason those columns are reachable by a client at all, and each one is gated on
--    `public.is_admin()`. A buyer, supplier or driver selecting from them gets zero
--    rows because the guard is false, not because a column was hidden in the UI.
--
--    Admins need this route because in Supabase every signed-in user shares one
--    database role (`authenticated`), so an admin cannot be granted extra columns.

-- ---------------------------------------------------------------------------
-- Role-facing (privileges of the caller)
-- ---------------------------------------------------------------------------

create view public.buyer_quotes with (security_invoker = true) as
select
  q.id, q.buyer_id, q.address_id, q.bird_type, q.weight_band, q.quantity,
  q.bird_price_cents, q.delivery_fee_cents, q.service_fee_cents, q.total_cents,
  q.kind, q.status, q.expires_at, q.paystack_payment_link, q.created_at
from public.quotes q;

create view public.supplier_allocations with (security_invoker = true) as
select
  a.id, a.order_id, a.supplier_id, a.quantity, a.supplier_price_cents, a.status,
  a.pickup_at, a.birds_counted, a.crates, a.welfare_ok, a.load_photo_path,
  a.removal_permit_path, a.permit_valid_until, a.crosses_province,
  a.movement_permit_path, a.created_at, a.updated_at
from public.allocations a;

create view public.driver_trips with (security_invoker = true) as
select
  t.id, t.allocation_id, t.driver_id, t.driver_share_cents, t.status, t.pickup_count,
  t.disinfection_photo_path, t.forecast_temp_c, t.picked_up_at, t.delivered_count,
  t.delivered_at, t.pod_photo_path, t.created_at, t.updated_at
from public.trips t;

grant select on public.buyer_quotes        to authenticated;
grant select on public.supplier_allocations to authenticated;
grant select on public.driver_trips        to authenticated;

-- ---------------------------------------------------------------------------
-- Admin-only (privileges of the owner, gated on is_admin())
-- ---------------------------------------------------------------------------

create view public.admin_quotes with (security_invoker = false) as
select q.* from public.quotes q where public.is_admin();

create view public.admin_allocations with (security_invoker = false) as
select a.* from public.allocations a where public.is_admin();

create view public.admin_trips with (security_invoker = false) as
select t.* from public.trips t where public.is_admin();

grant select on public.admin_quotes      to authenticated;
grant select on public.admin_allocations to authenticated;
grant select on public.admin_trips       to authenticated;
