// Pure money maths in integer cents. See Pricing and payments worked example (order #MC-1053).
export const TRANSFER_FEE_CENTS = 300; // R3 per Paystack transfer, before VAT
export const VAT_RATE = 0.15;

/** Paystack ZA estimate incl. VAT: card 2.9% + R1; EFT / Capitec Pay / QR 2%. */
export function estimatePaystackFeeCents(grossCents: number, channel: string | null): number {
  const base = channel === 'eft' || channel === 'capitec_pay' || channel === 'qr'
    ? grossCents * 0.02
    : grossCents * 0.029 + 100;
  return Math.round(base * (1 + VAT_RATE));
}

export function transferFeesCents(count: number): number {
  return Math.round(count * TRANSFER_FEE_CENTS * (1 + VAT_RATE));
}

export function driverShareCents(deliveryFeeCents: number, sharePct: number): number {
  return Math.round((deliveryFeeCents * sharePct) / 100);
}

export interface BreakdownInput {
  birdPriceCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  supplierCostCents: number;
  driverShareCents: number;
  paystackFeeCents: number;
  transferCount: number;
}
export interface Breakdown {
  buyerPaysCents: number;
  supplierCostCents: number;
  driverShareCents: number;
  paystackFeeCents: number;
  transferFeesCents: number;
  marginCents: number;
  /** Margin as % of what the buyer paid, 1 decimal. 0 when nothing was paid. */
  marginPct: number;
}

export function computeBreakdown(i: BreakdownInput): Breakdown {
  const buyerPaysCents = i.birdPriceCents + i.deliveryFeeCents + i.serviceFeeCents;
  const fees = transferFeesCents(i.transferCount);
  const marginCents = buyerPaysCents - i.supplierCostCents - i.driverShareCents - i.paystackFeeCents - fees;
  return {
    buyerPaysCents,
    supplierCostCents: i.supplierCostCents,
    driverShareCents: i.driverShareCents,
    paystackFeeCents: i.paystackFeeCents,
    transferFeesCents: fees,
    marginCents,
    marginPct: buyerPaysCents > 0 ? Math.round((marginCents / buyerPaysCents) * 1000) / 10 : 0,
  };
}

export type RematchOutcome = 'cheaper_keep_price' | 'absorb' | 'full_refund';

/**
 * Re-match rule: the buyer's price never changes. A cheaper supplier keeps the buyer's price
 * (extra margin is ours); a dearer one is absorbed only while margin stays >= 0, otherwise the
 * buyer gets a full refund.
 */
export function evaluateRematch(
  current: BreakdownInput,
  next: { supplierCostCents: number; driverShareCents: number },
): { outcome: RematchOutcome; newMarginCents: number } {
  const after = computeBreakdown({ ...current, ...next });
  if (after.marginCents < 0) return { outcome: 'full_refund', newMarginCents: after.marginCents };
  const cheaper = next.supplierCostCents + next.driverShareCents <= current.supplierCostCents + current.driverShareCents;
  return { outcome: cheaper ? 'cheaper_keep_price' : 'absorb', newMarginCents: after.marginCents };
}
