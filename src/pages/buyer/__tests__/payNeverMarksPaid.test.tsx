// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authMock, makeOrder, renderAt } from './testUtils';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../auth/AuthContext', () => authMock());
vi.mock('../api', () => ({ getQuote: vi.fn(), getPayState: vi.fn(), getOrder: vi.fn() }));
vi.mock('../lib/payments', async (orig) => ({
  ...(await orig<typeof import('../lib/payments')>()),
  startCheckout: vi.fn(),
  redirectToCheckout: vi.fn(),
}));

import * as api from '../api';
import PaymentPaid from '../PaymentPaid';
import ReviewPay from '../ReviewPay';
import * as payments from '../lib/payments';
import { verdictOf } from '../hooks/usePayState';

const quote = {
  id: 'q1', address_id: 'a1', bird_type: 'broiler', weight_band: '2_to_2_5kg', quantity: 20,
  bird_price_cents: 200_00, delivery_fee_cents: 50_00, service_fee_cents: 10_00, total_cents: 260_00,
  kind: 'instant', status: 'open', expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  paystack_payment_link: null, created_at: new Date().toISOString(),
} as const;

describe('Review and pay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs both acceptances, then hands off to Paystack WITHOUT marking anything paid', async () => {
    vi.mocked(api.getQuote).mockResolvedValue({ ...quote });
    vi.mocked(payments.startCheckout).mockResolvedValue({ authorizationUrl: 'https://checkout.paystack.com/abc' });
    renderAt('/orders/new/pay?quote=q1', '/orders/new/pay', <ReviewPay />);

    const pay = await screen.findByRole('button', { name: 'Pay with Paystack' });
    expect(pay).toBeDisabled();
    const [terms, refunds] = screen.getAllByRole('checkbox');
    fireEvent.click(terms);
    expect(pay).toBeDisabled();
    fireEvent.click(refunds);
    expect(pay).toBeEnabled();

    fireEvent.click(pay);
    await waitFor(() => expect(payments.redirectToCheckout).toHaveBeenCalledWith('https://checkout.paystack.com/abc'));
    expect(payments.startCheckout).toHaveBeenCalledWith('q1');
    // Still just "redirecting": no success copy, and we never even asked for payment status.
    expect(screen.queryByText('Payment received')).not.toBeInTheDocument();
    expect(api.getPayState).not.toHaveBeenCalled();
  });

  it('shows an error and stays unpaid when checkout init fails', async () => {
    vi.mocked(api.getQuote).mockResolvedValue({ ...quote });
    vi.mocked(payments.startCheckout).mockRejectedValue(new Error('boom'));
    renderAt('/orders/new/pay?quote=q1', '/orders/new/pay', <ReviewPay />);
    await screen.findByRole('button', { name: 'Pay with Paystack' });
    const [terms, refunds] = screen.getAllByRole('checkbox');
    fireEvent.click(terms);
    fireEvent.click(refunds);
    fireEvent.click(screen.getByRole('button', { name: 'Pay with Paystack' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You haven't been charged");
    expect(payments.redirectToCheckout).not.toHaveBeenCalled();
  });

  it('blocks payment for an expired quote', async () => {
    vi.mocked(api.getQuote).mockResolvedValue({ ...quote, expires_at: new Date(Date.now() - 1000).toISOString() });
    renderAt('/orders/new/pay?quote=q1', '/orders/new/pay', <ReviewPay />);
    expect((await screen.findAllByText('This quote has expired.')).length).toBeGreaterThan(0);
    const [terms, refunds] = screen.getAllByRole('checkbox');
    fireEvent.click(terms);
    fireEvent.click(refunds);
    expect(screen.getByRole('button', { name: 'Pay with Paystack' })).toBeDisabled();
  });
});

describe('Payment received page only reflects server status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getOrder).mockResolvedValue(makeOrder());
  });

  it('keeps checking (never shows success) while the server still says pending', async () => {
    vi.mocked(api.getPayState).mockResolvedValue({ orderStatus: 'placed', paymentStatus: 'pending' });
    renderAt('/orders/o1/paid', '/orders/:id/paid', <PaymentPaid />);
    expect(await screen.findByText('Confirming your payment…')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByText('Payment received')).not.toBeInTheDocument();
  });

  it('shows success only once the server reports it', async () => {
    vi.mocked(api.getPayState).mockResolvedValue({ orderStatus: 'paid', paymentStatus: 'succeeded' });
    renderAt('/orders/o1/paid', '/orders/:id/paid', <PaymentPaid />);
    expect(await screen.findByText('Payment received')).toBeInTheDocument();
  });

  it('verdictOf is a pure function of server fields', () => {
    expect(verdictOf('placed', 'pending')).toBe('checking');
    expect(verdictOf('placed', null)).toBe('checking');
    expect(verdictOf('placed', 'failed')).toBe('failed');
    expect(verdictOf('placed', 'succeeded')).toBe('paid');
    expect(verdictOf('paid', null)).toBe('paid');
    expect(verdictOf('cancelled', null)).toBe('failed');
  });
});
