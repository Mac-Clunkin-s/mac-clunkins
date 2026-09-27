-- McCluckin's — server-side human-readable numbers.
--
-- orders.number is MC-0001, cases.number is CASE-2026-00001. Both are assigned by a
-- BEFORE INSERT trigger that ignores whatever the client sent, so a client cannot
-- choose, guess-ahead or collide on a number.

create sequence if not exists public.order_number_seq as bigint start with 1 increment by 1;

create or replace function public.next_order_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'MC-' || lpad(nextval('public.order_number_seq')::text, 4, '0')
$$;

create or replace function public.set_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Always overwrite: the number is ours, not the client's.
  new.number := public.next_order_number();
  return new;
end;
$$;

create trigger orders_set_number
  before insert on public.orders
  for each row execute function public.set_order_number();

-- Case numbers restart at 1 each calendar year, so they cannot come from a plain
-- sequence. An advisory transaction lock serialises the read-then-write; case volume
-- is low enough that this is cheaper than maintaining a counter table.
create or replace function public.next_case_number()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_year text := to_char(now() at time zone 'Africa/Johannesburg', 'YYYY');
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.cases.number'));

  select coalesce(max(substring(c.number from 11)::integer), 0) + 1
    into v_next
  from public.cases c
  where c.number like 'CASE-' || v_year || '-%';

  return 'CASE-' || v_year || '-' || lpad(v_next::text, 5, '0');
end;
$$;

create or replace function public.set_case_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.number := public.next_case_number();
  return new;
end;
$$;

create trigger cases_set_number
  before insert on public.cases
  for each row execute function public.set_case_number();

-- Clients never call these directly; the triggers do.
revoke all on function public.next_order_number() from public;
revoke all on function public.next_case_number() from public;
revoke all on sequence public.order_number_seq from public;

-- Keeps updated_at honest without every writer remembering to set it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger supplier_details_touch_updated_at before update on public.supplier_details
  for each row execute function public.touch_updated_at();
create trigger supplier_prices_touch_updated_at before update on public.supplier_prices
  for each row execute function public.touch_updated_at();
create trigger driver_details_touch_updated_at before update on public.driver_details
  for each row execute function public.touch_updated_at();
create trigger allocations_touch_updated_at before update on public.allocations
  for each row execute function public.touch_updated_at();
create trigger trips_touch_updated_at before update on public.trips
  for each row execute function public.touch_updated_at();
create trigger cases_touch_updated_at before update on public.cases
  for each row execute function public.touch_updated_at();
create trigger documents_touch_updated_at before update on public.documents
  for each row execute function public.touch_updated_at();
create trigger payments_touch_updated_at before update on public.payments
  for each row execute function public.touch_updated_at();
create trigger transfers_touch_updated_at before update on public.transfers
  for each row execute function public.touch_updated_at();
create trigger refunds_touch_updated_at before update on public.refunds
  for each row execute function public.touch_updated_at();
