// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authMock, renderAt } from './testUtils';

const rpc = vi.fn();
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('../../../auth/AuthContext', () => authMock());
vi.mock('../../../lib/billing', () => ({
  usePaymentsMode: () => ({ mode: 'manual', ready: true }),
  issueQuoteDocument: vi.fn(),
  openBillingPdf: vi.fn(),
}));
vi.mock('../api', () => ({ getQuote: vi.fn() }));
vi.mock('../lib/payments', async (orig) => ({
  ...(await orig<typeof import('../lib/payments')>()),
  startCheckout: vi.fn(),
}));

import * as api from '../api';
import * as payments from '../lib/payments';
import ReviewPay from '../ReviewPay';

const quote = {
  id: 'q1', address_id: 'a1', bird_type: 'broiler', weight_band: '2_to_2_5kg', quantity: 20,
  bird_price_cents: 200_00, delivery_fee_cents: 50_00, service_fee_cents: 10_00, total_cents: 260_00,
  kind: 'instant', status: 'open', expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  paystack_payment_link: null, created_at: new Date().toISOString(),
} as const;

describe('Review and pay in manual payments mode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('places the order through accept_quote_create_order and never starts Paystack checkout', async () => {
    vi.mocked(api.getQuote).mockResolvedValue(quote as never);
    rpc.mockResolvedValue({ data: { order_id: 'o9' }, error: null });
    renderAt('/orders/new/pay?quote=q1', '/orders/new/pay', <ReviewPay />);
    const button = await screen.findByRole('button', { name: 'Place order' });
    expect(screen.queryByText(/Paystack/)).not.toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    boxes.forEach((b) => fireEvent.click(b));
    fireEvent.click(button);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('accept_quote_create_order', { p_quote_id: 'q1' }));
    expect(payments.startCheckout).not.toHaveBeenCalled();
  });

  it('shows an error and stays on the page when placing the order fails', async () => {
    vi.mocked(api.getQuote).mockResolvedValue(quote as never);
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    renderAt('/orders/new/pay?quote=q1', '/orders/new/pay', <ReviewPay />);
    const button = await screen.findByRole('button', { name: 'Place order' });
    screen.getAllByRole('checkbox').forEach((b) => fireEvent.click(b));
    fireEvent.click(button);
    expect(await screen.findByText("Couldn't place your order. Please try again.")).toBeInTheDocument();
  });
});
