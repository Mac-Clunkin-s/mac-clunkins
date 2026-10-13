// Integer-cents money maths, mirrored from the SQL functions in
// 20261012000100_pricing_engine.sql so the two can be checked against each other.
// Everything is BigInt-backed: no floating point ever touches an amount.

export interface PricingSettings {
  markup_pct: number;
  min_margin_cents: number;
  service_fee_pct: number;
  delivery_base_cents: number;
  delivery_per_km_cents: number;
  delivery_per_bird_cents: number;
  driver_share_pct: number;
}

export interface FeeSettings {
  paystack_card_pct: number;
  paystack_card_flat_cents: number;
  paystack_vat_pct: number;
  paystack_transfer_fee_cents: number;
}

export interface AllocationInput {
  supplier_id?: string;
  birds: number;
  price_cents: number;
  distance_km: number;
}

const SCALE = 1000n; // percentages and km carry up to 3 decimals

function scaled(n: number): bigint {
  return BigInt(Math.round(n * Number(SCALE)));
}

/** round(num / den), halves up, for non-negative num and positive den. */
export function divRoundHalfUp(num: bigint, den: bigint): bigint {
  return (2n * num + den) / (2n * den);
}

/** amount * pct / 100, half up. */
export function pctOf(amountCents: bigint | number, pct: number): bigint {
  return divRoundHalfUp(BigInt(amountCents) * scaled(pct), 100n * SCALE);
}

export function calculateQuoteBreakdown(settings: PricingSettings, allocations: AllocationInput[]) {
  if (!allocations.length) throw new Error('at least one allocation is required');
  let birdsTotal = 0n, deliveryTotal = 0n, driverTotal = 0n, supplierTotal = 0n, qty = 0n, maxKm = 0;
  const out = allocations.map((a) => {
    if (!(a.birds > 0) || a.price_cents < 0 || a.distance_km < 0) throw new Error('invalid allocation');
    const price = BigInt(a.price_cents), birds = BigInt(a.birds);
    const markup = pctOf(price, settings.markup_pct);
    const margin = markup > BigInt(settings.min_margin_cents) ? markup : BigInt(settings.min_margin_cents);
    const birdPrice = price + margin;
    // base + km*per_km + birds*per_bird, with km in thousandths
    const delivery = divRoundHalfUp(
      BigInt(settings.delivery_base_cents) * SCALE + scaled(a.distance_km) * BigInt(settings.delivery_per_km_cents) +
        birds * BigInt(settings.delivery_per_bird_cents) * SCALE,
      SCALE,
    );
    const driver = pctOf(delivery, settings.driver_share_pct);
    birdsTotal += birdPrice * birds; deliveryTotal += delivery; driverTotal += driver;
    supplierTotal += price * birds; qty += birds; maxKm = Math.max(maxKm, a.distance_km);
    return {
      supplier_id: a.supplier_id, birds: Number(birds), distance_km: a.distance_km,
      supplier_price_cents: Number(price), margin_cents: Number(margin), bird_price_cents: Number(birdPrice),
      birds_total_cents: Number(birdPrice * birds), delivery_fee_cents: Number(delivery),
      driver_share_cents: Number(driver), supplier_total_cents: Number(price * birds),
    };
  });
  const service = pctOf(birdsTotal + deliveryTotal, settings.service_fee_pct);
  return {
    birds: Number(qty), max_distance_km: maxKm,
    bird_price_cents: Number(divRoundHalfUp(birdsTotal, qty)),
    birds_total_cents: Number(birdsTotal), delivery_fee_cents: Number(deliveryTotal),
    service_fee_cents: Number(service), total_cents: Number(birdsTotal + deliveryTotal + service),
    driver_share_cents: Number(driverTotal), supplier_total_cents: Number(supplierTotal),
    allocations: out,
  };
}

export function calculatePriceBreakdown(settings: PricingSettings, supplierPriceCents: number, birds: number, km: number) {
  return calculateQuoteBreakdown(settings, [{ price_cents: supplierPriceCents, birds, distance_km: km }]);
}

/**
 * What McCluckin's keeps after Paystack's own costs.
 * ASSUMPTIONS (reproduce the Brief's R632.38): the card fee is 2.9% of the total charged
 * + R1 flat, then VAT 15% on that fee; each of the 2 payouts costs R3 + VAT; the
 * Paystack fee is not passed on to the buyer beyond the service fee already in the total.
 */
export function estimateMargin(
  fees: FeeSettings, totalCents: number, supplierCents: number, driverCents: number, transferCount = 2,
) {
  const vat = 100 + fees.paystack_vat_pct;
  const cardPre = BigInt(totalCents) * scaled(fees.paystack_card_pct) + BigInt(fees.paystack_card_flat_cents) * 100n * SCALE;
  const card = divRoundHalfUp(cardPre * scaled(vat), 100n * SCALE * 100n * SCALE);
  const transfers = divRoundHalfUp(
    BigInt(transferCount) * BigInt(fees.paystack_transfer_fee_cents) * scaled(vat), 100n * SCALE);
  return {
    card_fee_cents: Number(card), transfer_fees_cents: Number(transfers),
    mccluckins_keeps_cents: totalCents - supplierCents - driverCents - Number(card) - Number(transfers),
  };
}
