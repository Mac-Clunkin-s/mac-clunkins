-- Views are read-only surfaces. Supabase default privileges had granted anon and authenticated full
-- DML on them. The three admin_* views run as their owner (security_invoker = false) and are
-- auto-updatable, so an INSERT/UPDATE/DELETE through them would have bypassed RLS on the base table.
-- Lock every public view to SELECT for signed-in users and nothing for anon.
revoke all on public.admin_quotes, public.admin_allocations, public.admin_trips,
  public.buyer_quotes, public.driver_trips, public.supplier_allocations from anon, public;
revoke all on public.admin_quotes, public.admin_allocations, public.admin_trips,
  public.buyer_quotes, public.driver_trips, public.supplier_allocations from authenticated;
grant select on public.admin_quotes, public.admin_allocations, public.admin_trips,
  public.buyer_quotes, public.driver_trips, public.supplier_allocations to authenticated;
