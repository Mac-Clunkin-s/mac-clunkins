// Pricing maths. The first group runs the TypeScript module (no database); the second
// runs the SQL functions and asserts they agree to the cent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePriceBreakdown, calculateQuoteBreakdown, estimateMargin } from '../../supabase/functions/_shared/money.ts';
import { connect } from '../rls/helpers.mjs';
import { SETTINGS, buildWorld, setSetting } from './fixtures.mjs';

const FEES = {
  paystack_card_pct: SETTINGS.paystack_card_pct, paystack_card_flat_cents: SETTINGS.paystack_card_flat_cents,
  paystack_vat_pct: SETTINGS.paystack_vat_pct, paystack_transfer_fee_cents: SETTINGS.paystack_transfer_fee_cents,
};

test('#MC-1053 worked example, exact to the cent (TypeScript)', () => {
  const b = calculatePriceBreakdown(SETTINGS, 7500, 50, 38);
  assert.equal(b.allocations[0].bird_price_cents, 8625);     // R75 + 15%
  assert.equal(b.birds_total_cents, 431250);                 // R4,312.50
  assert.equal(b.delivery_fee_cents, 50400);                 // R150 + 38*R8 + 50*R1
  assert.equal(b.service_fee_cents, 16858);                  // 3.5% of 481,650 = 16,857.75 -> up
  assert.equal(b.total_cents, 498508);                       // R4,985.08
  assert.equal(b.driver_share_cents, 42840);                 // 85% of R504
  assert.equal(b.supplier_total_cents, 375000);              // 50 x R75
});

test("what McCluckin's keeps on #MC-1053 = R632.38 (assumptions in estimateMargin)", () => {
  const m = estimateMargin(FEES, 498508, 375000, 42840);
  assert.equal(m.card_fee_cents, 16740);        // (2.9% x 498,508 + R1) x 1.15 = 16,740.24
  assert.equal(m.transfer_fees_cents, 690);     // 2 x R3 x 1.15
  assert.equal(m.mccluckins_keeps_cents, 63238);
});

test('rounding is half-up on every fee', () => {
  // markup 15% of 7510 = 1126.5 -> 1127
  assert.equal(calculatePriceBreakdown(SETTINGS, 7510, 10, 0).allocations[0].margin_cents, 1127);
  // delivery: R0.50/km makes half-cents: 0.01 km -> 0.5c -> 1c, 0.02 km -> 1c, 0.03 km -> 1.5c -> 2c
  const half = { ...SETTINGS, delivery_base_cents: 0, delivery_per_bird_cents: 0, delivery_per_km_cents: 50 };
  assert.equal(calculatePriceBreakdown(half, 7500, 1, 0.01).delivery_fee_cents, 1);
  assert.equal(calculatePriceBreakdown(half, 7500, 1, 0.02).delivery_fee_cents, 1);
  assert.equal(calculatePriceBreakdown(half, 7500, 1, 0.03).delivery_fee_cents, 2);
  assert.equal(calculatePriceBreakdown(SETTINGS, 7500, 50, 38).service_fee_cents, 16858);
});

test('minimum margin floor applies when 15% is below R8/bird', () => {
  // R40 supplier price: 15% = R6 < R8 -> margin R8, bird price R48
  const b = calculatePriceBreakdown(SETTINGS, 4000, 20, 10);
  assert.equal(b.allocations[0].margin_cents, 800);
  assert.equal(b.allocations[0].bird_price_cents, 4800);
  // exactly at the break-even (R53.33 -> 15% = 800): the floor does not add on top
  assert.equal(calculatePriceBreakdown(SETTINGS, 5334, 1, 0).allocations[0].margin_cents, 800);
  assert.equal(calculatePriceBreakdown(SETTINGS, 5400, 1, 0).allocations[0].margin_cents, 810);
});

test('a split order pays one delivery fee per vehicle, one service fee overall', () => {
  const b = calculateQuoteBreakdown(SETTINGS, [
    { price_cents: 7500, birds: 120, distance_km: 38 }, { price_cents: 7500, birds: 80, distance_km: 38 }]);
  assert.equal(b.allocations.length, 2);
  assert.equal(b.delivery_fee_cents, (15000 + 38 * 800 + 120 * 100) + (15000 + 38 * 800 + 80 * 100));
  assert.equal(b.total_cents, b.birds_total_cents + b.delivery_fee_cents + b.service_fee_cents);
});

// ---------------------------------------------------------------------------
// SQL parity
// ---------------------------------------------------------------------------
let c;
before(async () => { c = await connect(); await c.query('begin'); await buildWorld(c); });
after(async () => { await c.query('rollback'); await c.end(); });

const sql = async (q, p = []) => (await c.query(q, p)).rows;

test('SQL calculate_price_breakdown reproduces #MC-1053 exactly', async () => {
  const [{ b }] = await sql('select public.calculate_price_breakdown(7500, 50, 38) as b');
  assert.equal(b.allocations[0].bird_price_cents, 8625);
  assert.equal(b.birds_total_cents, 431250);
  assert.equal(b.delivery_fee_cents, 50400);
  assert.equal(b.service_fee_cents, 16858);
  assert.equal(b.total_cents, 498508);
  assert.equal(b.driver_share_cents, 42840);
  assert.equal(b.supplier_total_cents, 375000);
  assert.equal(b.settings.markup_pct, 15);
});

test('SQL estimate_margin gives R632.38 for #MC-1053', async () => {
  const [{ m }] = await sql('select public.estimate_margin(498508, 375000, 42840) as m');
  assert.deepEqual([m.card_fee_cents, m.transfer_fees_cents, m.mccluckins_keeps_cents], [16740, 690, 63238]);
});

test('SQL and TypeScript agree across a grid of inputs', async () => {
  for (const price of [4000, 5334, 7510, 7500, 12345])
    for (const birds of [10, 50, 199])
      for (const km of [0, 12.5, 38, 299.99]) {
        const [{ b }] = await sql('select public.calculate_price_breakdown($1, $2, $3) as b', [price, birds, km]);
        const t = calculatePriceBreakdown(SETTINGS, price, birds, km);
        for (const k of ['birds_total_cents', 'delivery_fee_cents', 'service_fee_cents', 'total_cents', 'driver_share_cents', 'supplier_total_cents'])
          assert.equal(b[k], t[k], `${k} for price=${price} birds=${birds} km=${km}`);
      }
});

test('rates come from the settings table, never hardcoded', async () => {
  await setSetting(c, 'markup_pct', 20);
  await setSetting(c, 'min_margin_cents', 2000);
  const [{ b }] = await sql('select public.calculate_price_breakdown(7500, 50, 38) as b');
  assert.equal(b.allocations[0].margin_cents, 2000);          // floor now R20 > 20% of R75 = R15
  assert.equal(b.allocations[0].bird_price_cents, 9500);
  assert.equal(b.settings.min_margin_cents, 2000);
  await c.query('delete from public.settings where key = $1', ['delivery_base_cents']);
  await assert.rejects(sql('select public.calculate_price_breakdown(7500, 50, 38)'), /delivery_base_cents is not set/);
});
