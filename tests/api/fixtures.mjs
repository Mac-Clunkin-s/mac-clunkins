// Fixtures for the API suite. Every test opens a transaction, builds its own world with
// these helpers, and rolls back — so the suite is independent of supabase/seed.sql and
// leaves nothing behind. Ids are fixed so assertions can name them.

export const SETTINGS = {
  markup_pct: 15, min_margin_cents: 800, service_fee_pct: 3.5,
  delivery_base_cents: 15000, delivery_per_km_cents: 800, delivery_per_bird_cents: 100,
  driver_share_pct: 85, quote_hold_minutes: 30, rfq_min_birds: 200, rfq_max_km: 300,
  min_order: 10, unpaid_cancel_hours: 24, rfq_quote_hours: 24, doc_expiry_warn_days: 30,
  road_distance_factor: 1, paystack_card_pct: 2.9, paystack_card_flat_cents: 100,
  paystack_vat_pct: 15, paystack_transfer_fee_cents: 300, payout_max_attempts: 5, payout_retry_minutes: 15,
};

export const ID = {
  admin: 'a0000000-0000-4000-8000-000000000001',
  buyer: 'a0000000-0000-4000-8000-000000000002',
  buyer2: 'a0000000-0000-4000-8000-000000000003',
  driver: 'a0000000-0000-4000-8000-000000000021',
  s1: 'a0000000-0000-4000-8000-000000000011', // Benoni, GP
  s2: 'a0000000-0000-4000-8000-000000000012', // Pretoria, GP (further)
  s3: 'a0000000-0000-4000-8000-000000000013', // North West, closest but other province
  s4: 'a0000000-0000-4000-8000-000000000014', // Benoni, GP, more stock than s1
  paused: 'a0000000-0000-4000-8000-000000000031',
  controlled: 'a0000000-0000-4000-8000-000000000032',
  surveil: 'a0000000-0000-4000-8000-000000000033',
  surveilOk: 'a0000000-0000-4000-8000-000000000034',
  noDoc: 'a0000000-0000-4000-8000-000000000035',
  expiredDoc: 'a0000000-0000-4000-8000-000000000036',
  inactivePrice: 'a0000000-0000-4000-8000-000000000037',
  pending: 'a0000000-0000-4000-8000-000000000038',
  addrSoweto: 'b0000000-0000-4000-8000-000000000001',
  addrCape: 'b0000000-0000-4000-8000-000000000002',
};
export const BIRD = 'indigenous';
export const BAND = 'over_3kg';
const PT = (lon, lat) => `extensions.ST_SetSRID(extensions.ST_MakePoint(${lon}, ${lat}), 4326)::extensions.geography`;

export async function setSetting(c, key, value) {
  await c.query(
    `insert into public.settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value`, [key, JSON.stringify(value)]);
}

async function mkUser(c, id, role, status, name) {
  await c.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb) on conflict (id) do nothing`,
    [id, `${id}@apitest.local`, JSON.stringify({ role: role === 'admin' ? 'buyer' : role, full_name: name })]);
  await c.query(
    `insert into public.profiles (id, role, status, full_name, business_name, email, pdma_number)
     values ($1, $2, $3, $4, $4, $5, $6)
     on conflict (id) do update set role = excluded.role, status = excluded.status, email = excluded.email`,
    [id, role, status, name, `${id}@apitest.local`, role === 'buyer' ? 'PDMA-T-1' : null]);
}

export async function mkSupplier(c, id, { lon, lat, province, stock = 500, price = 9000, minOrder = 10,
  paused = false, zone = 'none', docs = 'ok', priceActive = true, status = 'active', rating = null, name }) {
  await mkUser(c, id, 'supplier', status, name ?? `Supplier ${id.slice(-2)}`);
  await c.query(
    `insert into public.supplier_details (profile_id, location, province, avian_flu_zone, paused, rating_avg, pdma_number)
     values ($1, ${PT(lon, lat)}, $2, $3, $4, $5, 'PDMA-S')
     on conflict (profile_id) do update set location = excluded.location, province = excluded.province,
       avian_flu_zone = excluded.avian_flu_zone, paused = excluded.paused, rating_avg = excluded.rating_avg`,
    [id, province, zone, paused, rating]);
  await c.query(
    `insert into public.supplier_prices (supplier_id, bird_type, weight_band, price_cents, min_order, active)
     values ($1, $2, $3, $4, $5, $6) on conflict (supplier_id, bird_type, weight_band)
     do update set price_cents = excluded.price_cents, min_order = excluded.min_order, active = excluded.active`,
    [id, BIRD, BAND, price, minOrder, priceActive]);
  await c.query(
    `insert into public.stock (supplier_id, week_start, bird_type, birds_available)
     values ($1, date_trunc('week', current_date)::date, $2, $3)
     on conflict (supplier_id, week_start, bird_type) do update set birds_available = excluded.birds_available`,
    [id, BIRD, stock]);
  if (docs === 'ok' || docs === 'permit') {
    for (const kind of ['pdma', 'supplier_agreement']) await doc(c, id, kind, 'approved', null);
  } else if (docs === 'expired') {
    await doc(c, id, 'pdma', 'approved', "current_date - 1");
    await doc(c, id, 'supplier_agreement', 'approved', null);
  } else if (docs === 'partial') {
    await doc(c, id, 'pdma', 'approved', null);       // supplier_agreement missing
  }
  if (docs === 'permit') await doc(c, id, 'movement_permit', 'approved', null);
}

export async function doc(c, profileId, kind, status, expiresExpr) {
  await c.query(
    `insert into public.documents (profile_id, kind, status, expires_on)
     values ($1, $2, $3, ${expiresExpr ?? 'null'})`, [profileId, kind, status]);
}

/** Builds the standard world; returns nothing, ids are in ID. Call inside an open transaction. */
export async function buildWorld(c, { driverCapacity = 120 } = {}) {
  for (const [k, v] of Object.entries(SETTINGS)) await setSetting(c, k, v);
  await setSetting(c, 'supplier_required_docs', ['pdma', 'supplier_agreement']);
  await setSetting(c, 'driver_required_docs', []);
  for (const [code, name] of [['GP', 'Gauteng'], ['NW', 'North West'], ['WC', 'Western Cape'], ['KZN', 'KwaZulu-Natal']]) {
    await c.query(`insert into public.provinces (code, name) values ($1, $2) on conflict (code) do nothing`, [code, name]);
  }
  await mkUser(c, ID.admin, 'admin', 'active', 'Test Admin');
  await mkUser(c, ID.buyer, 'buyer', 'active', 'Test Buyer');
  await mkUser(c, ID.buyer2, 'buyer', 'active', 'Test Buyer Two');
  await c.query(
    `insert into public.addresses (id, owner_id, street, town, province, location) values
       ($1, $2, '14 Vilakazi St', 'Soweto', 'GP', ${PT(27.8546, -26.2378)}),
       ($3, $4, '1 Long St', 'Cape Town', 'WC', ${PT(18.4241, -33.9249)})
     on conflict (id) do nothing`, [ID.addrSoweto, ID.buyer, ID.addrCape, ID.buyer2]);

  // Ranked suppliers (buyer in Soweto, GP)
  await mkSupplier(c, ID.s1, { lon: 28.32, lat: -26.1885, province: 'GP', stock: 500, price: 8000 });
  await mkSupplier(c, ID.s4, { lon: 28.32, lat: -26.1885, province: 'GP', stock: 800, price: 9000 });
  await mkSupplier(c, ID.s2, { lon: 28.20, lat: -25.75, province: 'GP', stock: 900, price: 7000 });
  await mkSupplier(c, ID.s3, { lon: 27.60, lat: -26.30, province: 'NW', stock: 900, price: 6000 });
  // Would win on every criterion if they were eligible — each is excluded for one reason.
  const best = { lon: 27.86, lat: -26.24, province: 'GP', stock: 5000, price: 5000 };
  await mkSupplier(c, ID.paused, { ...best, paused: true });
  await mkSupplier(c, ID.controlled, { ...best, zone: 'controlled' });
  await mkSupplier(c, ID.surveil, { ...best, zone: 'surveillance' });
  await mkSupplier(c, ID.noDoc, { ...best, docs: 'partial' });
  await mkSupplier(c, ID.expiredDoc, { ...best, docs: 'expired' });
  await mkSupplier(c, ID.inactivePrice, { ...best, priceActive: false });
  await mkSupplier(c, ID.pending, { ...best, status: 'pending' });
  // Surveillance zone WITH an approved permit stays eligible (but is far down the ranking).
  await mkSupplier(c, ID.surveilOk, { lon: 29.5, lat: -26.5, province: 'GP', stock: 100, price: 9500, zone: 'surveillance', docs: 'permit' });

  await mkUser(c, ID.driver, 'driver', 'active', 'Test Driver');
  await c.query(
    `insert into public.driver_details (profile_id, vehicle_type, covered, capacity_birds, paused, paystack_recipient_code)
     values ($1, 'bakkie', true, $2, false, 'RCP_driver') on conflict (profile_id)
     do update set capacity_birds = excluded.capacity_birds, covered = true, paused = false, paystack_recipient_code = 'RCP_driver'`,
    [ID.driver, driverCapacity]);
  await c.query(`update public.supplier_details set paystack_recipient_code = 'RCP_' || profile_id::text
                  where profile_id = any ($1::uuid[])`, [[ID.s1, ID.s2, ID.s3, ID.s4]]);
}

/**
 * Run one statement as a database role with a JWT subject, KEEPING its effects in the
 * surrounding test transaction (tests/rls/helpers.mjs asRole rolls back, which is right
 * for read checks but would discard a quote we want to act on next). A failing statement
 * rolls back to a savepoint and rethrows, so the transaction stays usable.
 */
export async function act(c, uid, sql, params = [], dbRole = uid ? 'authenticated' : 'anon') {
  await c.query('savepoint act_sp');
  try {
    const claims = uid ? { sub: uid, role: dbRole, aud: 'authenticated' } : { role: dbRole };
    await c.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify(claims)]);
    await c.query(`set local role ${dbRole}`);
    const rows = (await c.query(sql, params)).rows;
    await c.query('reset role');
    await c.query('release savepoint act_sp');
    return rows;
  } catch (e) {
    await c.query('rollback to savepoint act_sp');
    await c.query('reset role');
    await c.query('release savepoint act_sp');
    throw e;
  }
}
export const actTry = (c, uid, sql, params = [], dbRole) =>
  act(c, uid, sql, params, dbRole).then((rows) => ({ ok: true, rows, error: null }), (error) => ({ ok: false, rows: [], error }));
