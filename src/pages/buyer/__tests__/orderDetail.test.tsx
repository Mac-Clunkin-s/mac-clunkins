// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authMock, makeOrder, renderAt } from './testUtils';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../auth/AuthContext', () => authMock());
vi.mock('../api', () => ({ getOrder: vi.fn() }));

import * as api from '../api';
import OrderDetail, { isScheduled } from '../OrderDetail';

const show = () => renderAt('/orders/o1', '/orders/:id', <OrderDetail />);

describe('OrderDetail delivery timeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('says the timeline is not set until McCluckin\'s schedules it, and shows no date or slot', async () => {
    vi.mocked(api.getOrder).mockResolvedValue(makeOrder({ status: 'paid', delivery_date: null, slot_label: null }));
    show();
    expect(await screen.findByTestId('timeline-not-set')).toHaveTextContent('Delivery timeline not set yet');
    expect(screen.queryByTestId('delivery-when')).not.toBeInTheDocument();
  });

  it('does not reveal a date for an unscheduled (paid) order even if one is present', async () => {
    vi.mocked(api.getOrder).mockResolvedValue(makeOrder({ status: 'paid', delivery_date: '2026-10-20', slot_label: 'Morning' }));
    show();
    expect(await screen.findByTestId('timeline-not-set')).toBeInTheDocument();
    expect(screen.queryByText(/Morning/)).not.toBeInTheDocument();
  });

  it('shows date and slot once scheduled', async () => {
    vi.mocked(api.getOrder).mockResolvedValue(
      makeOrder({ status: 'scheduled', delivery_date: '2026-10-20', slot_label: 'Morning 06:00-10:00' }),
    );
    show();
    const when = await screen.findByTestId('delivery-when');
    expect(when).toHaveTextContent('Morning 06:00-10:00');
    expect(screen.queryByTestId('timeline-not-set')).not.toBeInTheDocument();
  });

  it('isScheduled gates on status as well as date', () => {
    expect(isScheduled({ status: 'placed', delivery_date: '2026-10-20' })).toBe(false);
    expect(isScheduled({ status: 'scheduled', delivery_date: null })).toBe(false);
    expect(isScheduled({ status: 'on_the_way', delivery_date: '2026-10-20' })).toBe(true);
  });

  it('never renders any supplier information', async () => {
    vi.mocked(api.getOrder).mockResolvedValue(makeOrder({ status: 'scheduled', delivery_date: '2026-10-20' }));
    const { container } = show();
    await screen.findByTestId('delivery-when');
    expect(container.textContent?.toLowerCase()).not.toContain('supplier');
  });
});
