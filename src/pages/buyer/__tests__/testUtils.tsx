import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach } from 'vitest';
import type { OrderDetail } from '../types';

afterEach(() => cleanup());

export function renderAt(path: string, pattern: string, ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={ui} />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  );
}

export const authMock = () => ({
  useAuth: () => ({
    profile: { id: 'u1', full_name: 'Test Buyer', role: 'buyer', status: 'active' },
    signOut: () => Promise.resolve(),
  }),
});

export function makeOrder(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'o1',
    number: 'MC-0001',
    quote_id: 'q1',
    bird_type: 'broiler',
    weight_band: '2_to_2_5kg',
    quantity: 50,
    total_cents: 1_000_00,
    bird_price_cents: 800_00,
    delivery_fee_cents: 150_00,
    service_fee_cents: 50_00,
    status: 'paid',
    delivery_date: null,
    placed_at: '2026-09-01T08:00:00Z',
    address_id: null,
    delivery_code: null,
    paid_at: '2026-09-01T08:05:00Z',
    slot_label: null,
    address_text: '1 Main Rd, Soweto',
    events: [],
    payment_status: 'succeeded',
    payment_channel: 'card',
    rating: null,
    case_id: null,
    ...over,
  };
}
