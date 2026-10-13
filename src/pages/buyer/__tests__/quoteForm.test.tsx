// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authMock, renderAt } from './testUtils';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../auth/AuthContext', () => authMock());
vi.mock('../api', () => ({
  listProvinces: vi.fn().mockResolvedValue([{ code: 'GP', name: 'Gauteng' }]),
  listAddresses: vi.fn().mockResolvedValue([]),
  listOrders: vi.fn().mockResolvedValue([]),
  saveAddress: vi.fn().mockResolvedValue('a1'),
  createInstantQuote: vi.fn(),
  requestCustomQuote: vi.fn(),
}));

import * as api from '../api';
import NewOrder from '../NewOrder';
import { validateQuoteForm } from '../lib/quote';

const address = { province: 'GP', town: 'Soweto', street: '1 Main Rd' };

describe('validateQuoteForm', () => {
  const ok = { birdType: 'broiler', weightBand: '2_to_2_5kg', quantity: '10', addressId: '', newAddress: address } as const;

  it('accepts exactly the minimum order of 10', () => {
    expect(validateQuoteForm({ ...ok })).toEqual({});
  });
  it('rejects fewer than 10 birds', () => {
    expect(validateQuoteForm({ ...ok, quantity: '9' }).quantity).toBe('buyer.newOrder.errors.minQuantity');
  });
  it('rejects non-whole quantities', () => {
    expect(validateQuoteForm({ ...ok, quantity: '12.5' }).quantity).toBe('buyer.newOrder.errors.quantityWhole');
    expect(validateQuoteForm({ ...ok, quantity: '' }).quantity).toBe('buyer.newOrder.errors.quantityWhole');
  });
  it('requires an address (province, town and street) unless a saved one is chosen', () => {
    expect(validateQuoteForm({ ...ok, newAddress: { ...address, street: ' ' } }).address).toBeDefined();
    expect(validateQuoteForm({ ...ok, newAddress: null }).address).toBeDefined();
    expect(validateQuoteForm({ ...ok, addressId: 'saved-1', newAddress: null }).address).toBeUndefined();
  });
});

describe('NewOrder form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listProvinces).mockResolvedValue([{ code: 'GP', name: 'Gauteng' }] as never);
    vi.mocked(api.listAddresses).mockResolvedValue([]);
    vi.mocked(api.listOrders).mockResolvedValue([]);
    vi.mocked(api.saveAddress).mockResolvedValue('a1' as never);
  });

  const fill = async (quantity: string) => {
    await screen.findByLabelText(/Province/);
    fireEvent.change(screen.getByLabelText('Bird type'), { target: { value: 'broiler' } });
    fireEvent.change(screen.getByLabelText('Weight band'), { target: { value: '2_to_2_5kg' } });
    fireEvent.change(screen.getByLabelText(/How many birds/), { target: { value: quantity } });
  };

  it('shows the minimum-order error and does not ask for a quote', async () => {
    renderAt('/orders/new', '/orders/new', <NewOrder />);
    await fill('5');
    fireEvent.change(screen.getByLabelText('Province'), { target: { value: 'GP' } });
    fireEvent.change(screen.getByLabelText('Town or suburb'), { target: { value: 'Soweto' } });
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '1 Main Rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get instant quote' }));
    expect(await screen.findByText('The minimum order is 10 birds.')).toBeInTheDocument();
    expect(api.createInstantQuote).not.toHaveBeenCalled();
  });

  it('requires a delivery address', async () => {
    renderAt('/orders/new', '/orders/new', <NewOrder />);
    await fill('20');
    fireEvent.click(screen.getByRole('button', { name: 'Get instant quote' }));
    expect(await screen.findByText(/Add your delivery address/)).toBeInTheDocument();
    expect(api.saveAddress).not.toHaveBeenCalled();
    expect(api.createInstantQuote).not.toHaveBeenCalled();
  });

  it('shows the instant quote with a countdown when valid', async () => {
    vi.mocked(api.createInstantQuote).mockResolvedValue({
      kind: 'quote',
      quote: {
        id: 'q1', address_id: 'a1', bird_type: 'broiler', weight_band: '2_to_2_5kg', quantity: 20,
        bird_price_cents: 200_00, delivery_fee_cents: 50_00, service_fee_cents: 10_00, total_cents: 260_00,
        kind: 'instant', status: 'open', expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
        paystack_payment_link: null, created_at: new Date().toISOString(),
      },
    });
    renderAt('/orders/new', '/orders/new', <NewOrder />);
    await fill('20');
    fireEvent.change(screen.getByLabelText('Province'), { target: { value: 'GP' } });
    fireEvent.change(screen.getByLabelText('Town or suburb'), { target: { value: 'Soweto' } });
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '1 Main Rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get instant quote' }));
    await waitFor(() => expect(screen.getByTestId('countdown')).toBeInTheDocument());
    expect(screen.getByTestId('countdown').textContent).toMatch(/^2[89]:\d\d$/);
    expect(api.saveAddress).toHaveBeenCalledTimes(1);
  });

  it('sends orders over 200 birds to Request a quote without pricing them', async () => {
    renderAt('/orders/new', '/orders/new', <NewOrder />);
    await fill('250');
    fireEvent.change(screen.getByLabelText('Province'), { target: { value: 'GP' } });
    fireEvent.change(screen.getByLabelText('Town or suburb'), { target: { value: 'Soweto' } });
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '1 Main Rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get instant quote' }));
    expect(await screen.findByRole('button', { name: 'Request a quote' })).toBeInTheDocument();
    expect(api.createInstantQuote).not.toHaveBeenCalled();
  });
});
