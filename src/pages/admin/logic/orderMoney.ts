import type { AllocationRow, OrderRow, PaymentRow, TripRow } from '../types';
import { computeBreakdown, estimatePaystackFeeCents, type Breakdown, type BreakdownInput } from './money';

export interface OrderMoney {
  breakdown: Breakdown;
  /** Paystack fee was estimated (no recorded fee on the payment). */
  feeEstimated: boolean;
  /** No supplier allocation yet, so margin is not meaningful. */
  incomplete: boolean;
}

export function breakdownInput(
  order: Pick<OrderRow, 'bird_price_cents' | 'delivery_fee_cents' | 'service_fee_cents' | 'total_cents'>,
  allocations: Pick<AllocationRow, 'quantity' | 'supplier_price_cents'>[],
  trips: Pick<TripRow, 'driver_share_cents' | 'driver_id'>[],
  payments: Pick<PaymentRow, 'status' | 'fee_cents' | 'channel'>[],
): { input: BreakdownInput; feeEstimated: boolean } {
  const paid = payments.filter((p) => p.status === 'succeeded' || p.status === 'refunded');
  const recorded = paid.length > 0 && paid.every((p) => p.fee_cents !== null);
  const paystackFeeCents = recorded
    ? paid.reduce((s, p) => s + (p.fee_cents ?? 0), 0)
    : estimatePaystackFeeCents(order.total_cents, paid[0]?.channel ?? 'card');
  const input: BreakdownInput = {
    birdPriceCents: order.bird_price_cents,
    deliveryFeeCents: order.delivery_fee_cents,
    serviceFeeCents: order.service_fee_cents,
    supplierCostCents: allocations.reduce((s, a) => s + a.quantity * a.supplier_price_cents, 0),
    driverShareCents: trips.reduce((s, t) => s + t.driver_share_cents, 0),
    paystackFeeCents,
    transferCount: allocations.length + trips.filter((t) => t.driver_id).length,
  };
  return { input, feeEstimated: !recorded };
}

export function orderMoney(
  order: Parameters<typeof breakdownInput>[0],
  allocations: Parameters<typeof breakdownInput>[1],
  trips: Parameters<typeof breakdownInput>[2],
  payments: Parameters<typeof breakdownInput>[3],
): OrderMoney {
  const { input, feeEstimated } = breakdownInput(order, allocations, trips, payments);
  return { breakdown: computeBreakdown(input), feeEstimated, incomplete: allocations.length === 0 };
}
