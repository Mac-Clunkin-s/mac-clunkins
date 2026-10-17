-- MVP 1: payment happens outside the app (EFT/cash). A toggle switches between that and Paystack.
-- Invoices are issued when an order is placed, receipts when an admin records the payment,
-- quotes on request. Numbers are sequential per kind and year.

insert into public.settings (key, value, is_public, description) values
  ('payments_mode', '"manual"'::jsonb, true, 'manual = pay outside the app, admin marks paid; paystack = online checkout'),
  ('company_profile', jsonb_build_object(
      'name', 'McCluckin''s', 'address', '', 'email', '', 'phone', '', 'registration', '',
      'bank_name', '', 'account_holder', '', 'account_number', '', 'branch_code', '', 'account_type', 'Cheque'),
   false, 'Company and bank details printed on quotes, invoices and receipts')
on conflict (key) do nothing;

create table public.billing_counters (
  kind text not null,
  year integer not null,
  last_number integer not null default 0,
  primary key (kind, year)
);
alter table public.billing_counters enable row level security;
revoke all on public.billing_counters from public, anon, authenticated;

create table public.billing_documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('quote', 'invoice', 'receipt')),
  number       text not null unique,
  order_id     uuid references public.orders (id) on delete cascade,
  quote_id     uuid references public.quotes (id) on delete cascade,
  buyer_id     uuid not null references public.profiles (id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
  snapshot     jsonb not null,
  issued_at    timestamptz not null default now(),
  check (order_id is not null or quote_id is not null)
);
create index billing_documents_order_idx on public.billing_documents (order_id);
create index billing_documents_buyer_idx on public.billing_documents (buyer_id);
create unique index billing_one_invoice_per_order on public.billing_documents (order_id) where kind = 'invoice';
create unique index billing_one_receipt_per_order on public.billing_documents (order_id) where kind = 'receipt';
create unique index billing_one_quote_doc_per_quote on public.billing_documents (quote_id) where kind = 'quote' and order_id is null;
alter table public.billing_documents enable row level security;
revoke all on public.billing_documents from public, anon, authenticated;
grant select on public.billing_documents to authenticated;
create policy billing_documents_read_own on public.billing_documents for select to authenticated
  using (buyer_id = auth.uid());
create policy billing_documents_admin_read on public.billing_documents for select to authenticated
  using (public.is_admin());

create or replace function public.next_billing_number(p_kind text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from now())::integer;
  v_n integer;
  v_prefix text := case p_kind when 'invoice' then 'INV' when 'receipt' then 'RCT' else 'QUO' end;
begin
  insert into public.billing_counters as c (kind, year, last_number) values (p_kind, v_year, 1)
  on conflict (kind, year) do update set last_number = c.last_number + 1
  returning last_number into v_n;
  return v_prefix || '-' || v_year || '-' || lpad(v_n::text, 5, '0');
end $$;

create or replace function public.billing_party(p_buyer uuid, p_address uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', p.full_name, 'business', p.business_name, 'email', p.email, 'phone', p.whatsapp_phone,
    'address', (select concat_ws(', ', a.street, a.town, a.province) from public.addresses a where a.id = p_address))
  from public.profiles p where p.id = p_buyer
$$;

create or replace function public.billing_company()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.settings where key = 'company_profile'), '{}'::jsonb)
$$;

create or replace function public.issue_order_invoice(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_id uuid; v_birds integer;
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null then return null; end if;
  select id into v_id from public.billing_documents where order_id = o.id and kind = 'invoice';
  if v_id is not null then return v_id; end if;
  v_birds := o.total_cents - o.delivery_fee_cents - o.service_fee_cents;
  insert into public.billing_documents (kind, number, order_id, quote_id, buyer_id, amount_cents, snapshot)
  values ('invoice', public.next_billing_number('invoice'), o.id, o.quote_id, o.buyer_id, o.total_cents,
    jsonb_build_object(
      'title', 'Invoice', 'reference', o.number, 'order_number', o.number,
      'company', public.billing_company(), 'customer', public.billing_party(o.buyer_id, o.address_id),
      'lines', jsonb_build_array(
        jsonb_build_object('label', o.quantity || ' x ' || o.bird_type::text || ' chickens', 'cents', v_birds),
        jsonb_build_object('label', 'Delivery', 'cents', o.delivery_fee_cents),
        jsonb_build_object('label', 'Service fee', 'cents', o.service_fee_cents)),
      'total_cents', o.total_cents, 'status', 'unpaid'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.trg_order_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select value #>> '{}' from public.settings where key = 'payments_mode'), 'manual') = 'manual' then
    perform public.issue_order_invoice(new.id);
  end if;
  return null;
end $$;
create trigger orders_issue_invoice after insert on public.orders
  for each row execute function public.trg_order_invoice();

create or replace function public.issue_quote_document(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q public.quotes; v_id uuid; v_birds integer;
begin
  select * into q from public.quotes where id = p_quote_id;
  if q.id is null or not (public.is_admin() or q.buyer_id = auth.uid()) then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.total_cents is null then raise exception 'quote_not_priced' using errcode = 'P0001'; end if;
  select id into v_id from public.billing_documents where quote_id = q.id and kind = 'quote' and order_id is null;
  if v_id is not null then return v_id; end if;
  v_birds := q.total_cents - coalesce(q.delivery_fee_cents, 0) - coalesce(q.service_fee_cents, 0);
  insert into public.billing_documents (kind, number, quote_id, buyer_id, amount_cents, snapshot)
  values ('quote', public.next_billing_number('quote'), q.id, q.buyer_id, q.total_cents,
    jsonb_build_object(
      'title', 'Quote', 'valid_until', q.expires_at,
      'company', public.billing_company(), 'customer', public.billing_party(q.buyer_id, q.address_id),
      'lines', jsonb_build_array(
        jsonb_build_object('label', q.quantity || ' x ' || q.bird_type::text || ' chickens', 'cents', v_birds),
        jsonb_build_object('label', 'Delivery', 'cents', coalesce(q.delivery_fee_cents, 0)),
        jsonb_build_object('label', 'Service fee', 'cents', coalesce(q.service_fee_cents, 0))),
      'total_cents', q.total_cents))
  returning id into v_id;
  return v_id;
end $$;

-- What the buyer needs to pay by EFT. Bank details stay out of the public settings.
create or replace function public.get_payment_instructions(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.orders; c jsonb;
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null or not (public.is_admin() or o.buyer_id = auth.uid()) then return null; end if;
  c := public.billing_company();
  return jsonb_build_object('reference', o.number, 'amount_cents', o.total_cents,
    'bank_name', c ->> 'bank_name', 'account_holder', c ->> 'account_holder',
    'account_number', c ->> 'account_number', 'branch_code', c ->> 'branch_code',
    'account_type', c ->> 'account_type');
end $$;

create or replace function public.admin_mark_order_paid(
  p_order_id uuid, p_amount_cents integer, p_method text, p_reference text default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.orders; v_ref text; v_res jsonb; v_doc uuid; v_inv jsonb; v_paid timestamptz;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_method not in ('eft', 'cash', 'card_machine', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.status <> 'placed' then raise exception 'order_not_payable' using errcode = 'P0001'; end if;
  if p_amount_cents is distinct from o.total_cents then raise exception 'amount_mismatch' using errcode = '22023'; end if;
  v_ref := 'manual_' || lower(replace(o.number, '-', '')) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.payments (order_id, paystack_reference, amount_cents, status) values (o.id, v_ref, o.total_cents, 'pending');
  v_res := public.mark_order_paid(v_ref, o.total_cents, null, null);
  if v_res ->> 'result' <> 'paid' then raise exception 'could_not_mark_paid: %', v_res ->> 'result' using errcode = 'P0001'; end if;
  perform public.issue_order_invoice(o.id);
  select paid_at into v_paid from public.orders where id = o.id;
  select snapshot into v_inv from public.billing_documents where order_id = o.id and kind = 'invoice';
  insert into public.billing_documents (kind, number, order_id, quote_id, buyer_id, amount_cents, snapshot)
  values ('receipt', public.next_billing_number('receipt'), o.id, o.quote_id, o.buyer_id, o.total_cents,
    (v_inv - 'status') || jsonb_build_object(
      'title', 'Receipt', 'paid_at', v_paid, 'method', p_method, 'payment_reference', p_reference,
      'note', p_note, 'status', 'paid'))
  returning id into v_doc;
  update public.billing_documents set snapshot = snapshot || '{"status":"paid"}'::jsonb where order_id = o.id and kind = 'invoice';
  perform public.log_audit('payment.manual', 'orders', o.id::text, null,
    jsonb_build_object('method', p_method, 'reference', p_reference, 'amount_cents', o.total_cents));
  return jsonb_build_object('result', 'paid', 'order_id', o.id, 'receipt_id', v_doc);
end $$;

revoke all on function public.next_billing_number(text), public.billing_party(uuid, uuid), public.billing_company(),
  public.issue_order_invoice(uuid), public.trg_order_invoice() from public, anon, authenticated;
revoke all on function public.issue_quote_document(uuid), public.get_payment_instructions(uuid),
  public.admin_mark_order_paid(uuid, integer, text, text, text) from public, anon;
grant execute on function public.issue_quote_document(uuid), public.get_payment_instructions(uuid),
  public.admin_mark_order_paid(uuid, integer, text, text, text) to authenticated;
