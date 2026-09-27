-- McCluckin's — RLS helper functions.
--
-- These exist so a policy reads as one predicate instead of a repeated subquery.
-- They are `security definer` and owned by the migration role, so they can read
-- public.profiles without tripping profiles' own RLS (which would recurse).
--
-- Every function pins `search_path` to an empty string and fully qualifies every
-- name, so a caller cannot shadow `public` or `auth` with their own schema.

-- The calling user's role, or null for anon / a user with no profile row.
create or replace function public.current_profile_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.current_profile_status()
returns public.profile_status
language sql
stable
security definer
set search_path = ''
as $$
  select p.status from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;

-- True only for an approved, non-suspended user in the given role. Every
-- role-scoped read policy goes through this, which is what holds a pending
-- supplier or driver out of job and trip data entirely.
create or replace function public.is_active_role(p_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = p_role
      and p.status = 'active'
  )
$$;

-- A driver may read an address only when it is the delivery address of an order
-- that has a trip assigned to that driver. Nothing else in `addresses` is reachable.
create or replace function public.driver_can_read_address(p_address_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trips t
    join public.allocations a on a.id = t.allocation_id
    join public.orders o on o.id = a.order_id
    where t.driver_id = auth.uid()
      and o.address_id = p_address_id
  )
$$;

-- A driver may read a supplier's requirements only for a supplier they are
-- currently assigned to collect from (the Brief's "drivers matched to that supplier").
create or replace function public.driver_matched_to_supplier(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trips t
    join public.allocations a on a.id = t.allocation_id
    where t.driver_id = auth.uid()
      and a.supplier_id = p_supplier_id
  )
$$;

-- Does the calling buyer own this order? Used by the order's satellite tables
-- (payments, refunds, ratings, order_events) so they cannot drift from the order.
create or replace function public.buyer_owns_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.buyer_id = auth.uid()
  )
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.current_profile_status() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_active_role(public.user_role) from public;
revoke all on function public.driver_can_read_address(uuid) from public;
revoke all on function public.driver_matched_to_supplier(uuid) from public;
revoke all on function public.buyer_owns_order(uuid) from public;

grant execute on function public.current_profile_role() to anon, authenticated;
grant execute on function public.current_profile_status() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_active_role(public.user_role) to anon, authenticated;
grant execute on function public.driver_can_read_address(uuid) to authenticated;
grant execute on function public.driver_matched_to_supplier(uuid) to authenticated;
grant execute on function public.buyer_owns_order(uuid) to authenticated;
