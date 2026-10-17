import { MockBackend, USERS, type Json } from '../helpers/mockBackend';

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
const ago = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

export const QUOTE_ID = 'c0000000-0000-4000-8000-000000000001';
export const ORDER_ID = 'e0000000-0000-4000-8000-000000000001';
export const ADDRESS_ID = 'f0000000-0000-4000-8000-000000000001';

export function quote(over: Json = {}): Json {
  return {
    id: QUOTE_ID, address_id: ADDRESS_ID, bird_type: 'broiler', weight_band: '2_to_2_5kg', quantity: 20,
    bird_price_cents: 20000, delivery_fee_cents: 5000, service_fee_cents: 1000, total_cents: 26000,
    kind: 'instant', status: 'open', expires_at: minutes(20), paystack_payment_link: null, created_at: ago(1), ...over,
  };
}

export function order(over: Json = {}): Json {
  return {
    id: ORDER_ID, number: 'MC-000123', buyer_id: USERS.buyer.id, bird_type: 'broiler', weight_band: '2_to_2_5kg',
    quantity: 20, bird_price_cents: 20000, delivery_fee_cents: 5000, service_fee_cents: 1000, total_cents: 26000,
    status: 'placed', delivery_date: null, slot_id: null, placed_at: ago(5), paid_at: null, cancelled_at: null,
    address_id: ADDRESS_ID, quote_id: QUOTE_ID, delivery_code: null, delivery_slots: null,
    buyer: { full_name: 'Thandi Buyer', business_name: 'Thandi Shisanyama' },
    address: { town: 'Soweto', province: 'GP' }, slot: null, ...over,
  };
}

export const BANK = {
  reference: 'MC-000123', amount_cents: 26000, bank_name: 'FNB', account_holder: "McCluckin's (Pty) Ltd",
  account_number: '62000000001', branch_code: '250655', account_type: 'Cheque',
};

export function doc(kind: 'invoice' | 'receipt' | 'quote', n: number, over: Json = {}): Json {
  const prefix = { invoice: 'INV', receipt: 'RCT', quote: 'QUO' }[kind];
  return { id: `d${n}000000-0000-4000-8000-000000000001`, kind, number: `${prefix}-2026-0000${n}`, order_id: ORDER_ID, amount_cents: 26000, issued_at: ago(3), buyer_id: USERS.buyer.id, ...over };
}

/** A buyer backend with one open quote and one order, in manual-payment mode by default. */
export function buyerWorld(opts: { mode?: 'manual' | 'paystack'; orderStatus?: string; quoteOver?: Json; docs?: Json[] } = {}): MockBackend {
  const m = new MockBackend();
  m.addUser({ id: USERS.buyer.id, email: USERS.buyer.email, password: USERS.buyer.password, profile: { id: USERS.buyer.id, role: 'buyer', status: 'active', full_name: 'Thandi Buyer', business_name: null, business_type: null, whatsapp_phone: '+27820000000', email: USERS.buyer.email, language: 'en', pdma_number: null, created_at: ago(1000), updated_at: ago(1000) } });
  m.table('settings', [{ key: 'payments_mode', value: opts.mode ?? 'manual' }]);
  m.table('buyer_quotes', [quote(opts.quoteOver)]);
  m.table('orders', [order({ status: opts.orderStatus ?? 'placed', paid_at: opts.orderStatus && opts.orderStatus !== 'placed' ? ago(1) : null })]);
  m.table('addresses', [{ id: ADDRESS_ID, label: 'Home', street: '12 Vilakazi St', town: 'Soweto', province: 'GP', is_default: true }]);
  m.table('billing_documents', opts.docs ?? []);
  m.rpc('get_payment_instructions', () => ({ data: BANK }));
  m.rpc('accept_quote_create_order', () => ({ data: { order_id: ORDER_ID } }));
  m.rpc('issue_quote_document', () => ({ data: doc('quote', 7).id }));
  m.fn('billing-pdf', () => ({ pdf: true }));
  return m;
}
