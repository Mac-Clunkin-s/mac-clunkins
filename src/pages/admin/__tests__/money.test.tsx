// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'a1', role: 'admin', status: 'active', full_name: 'Admin' }, signOut: vi.fn() }),
  roleHomePath: () => '/admin',
}));

import { formatCents } from '../../../lib/format';
import { computeBreakdown, estimatePaystackFeeCents, evaluateRematch, transferFeesCents } from '../logic/money';
import { orderMoney } from '../logic/orderMoney';
import { MoneyBreakdown } from '../MoneyBreakdown';

afterEach(cleanup);

// Order #MC-1053: 50 broilers, supplier R75, 38 km, card.
const order = { bird_price_cents: 431250, delivery_fee_cents: 50400, service_fee_cents: 16858, total_cents: 498508 };

describe('money from cents', () => {
  it('reproduces the worked example (R632.38 kept)', () => {
    expect(estimatePaystackFeeCents(498508, 'card')).toBe(16740);
    expect(transferFeesCents(2)).toBe(690);
    const m = orderMoney(order, [{ quantity: 50, supplier_price_cents: 7500 }], [{ driver_share_cents: 42840, driver_id: 'd1' }], []);
    expect(m.breakdown.buyerPaysCents).toBe(498508);
    expect(m.breakdown.supplierCostCents).toBe(375000);
    expect(m.breakdown.marginCents).toBe(63238);
    expect(m.feeEstimated).toBe(true);
    expect(m.incomplete).toBe(false);
  });

  it('renders every line formatted from cents, margin included', () => {
    const b = computeBreakdown({
      birdPriceCents: order.bird_price_cents, deliveryFeeCents: order.delivery_fee_cents, serviceFeeCents: order.service_fee_cents,
      supplierCostCents: 375000, driverShareCents: 42840, paystackFeeCents: 16740, transferCount: 2,
    });
    const { container } = render(<MemoryRouter><MoneyBreakdown order={order} breakdown={b} /></MemoryRouter>);
    const cents = [...container.querySelectorAll('[data-cents]')].map((n) => Number(n.getAttribute('data-cents')));
    expect(cents).toEqual([431250, 50400, 16858, 498508, 375000, 42840, 16740, 690, 63238]);
    const text = container.textContent ?? '';
    expect(text).toContain(formatCents(63238));
    expect(text).toContain(formatCents(498508));
    expect(b.marginPct).toBe(12.7);
  });
});

describe('re-match rule', () => {
  const current = {
    birdPriceCents: 431250, deliveryFeeCents: 50400, serviceFeeCents: 16858,
    supplierCostCents: 375000, driverShareCents: 42840, paystackFeeCents: 16740, transferCount: 2,
  };
  it('cheaper supplier keeps the buyer price', () => {
    expect(evaluateRematch(current, { supplierCostCents: 350000, driverShareCents: 42840 }).outcome).toBe('cheaper_keep_price');
  });
  it('dearer supplier is absorbed while margin >= 0', () => {
    const r = evaluateRematch(current, { supplierCostCents: 430000, driverShareCents: 42840 });
    expect(r.outcome).toBe('absorb');
    expect(r.newMarginCents).toBeGreaterThanOrEqual(0);
  });
  it('full refund once margin would go negative', () => {
    const r = evaluateRematch(current, { supplierCostCents: 450000, driverShareCents: 42840 });
    expect(r.newMarginCents).toBeLessThan(0);
    expect(r.outcome).toBe('full_refund');
  });
});
