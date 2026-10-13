// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { authMock, makeOrder, renderAt } from './testUtils';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../auth/AuthContext', () => authMock());
vi.mock('../api', () => ({ getOrder: vi.fn(), getTracking: vi.fn() }));

import * as api from '../api';
import { DeliveryCode } from '../components/DeliveryCode';
import Track, { firstName } from '../Track';

describe('DeliveryCode', () => {
  it('shows a valid 4-digit code one digit per cell', () => {
    render(<DeliveryCode code="4821" />);
    const box = screen.getByTestId('delivery-code');
    expect(box).toHaveAttribute('aria-label', 'Delivery code 4 8 2 1');
    expect(box.textContent).toBe('4821');
  });
  it.each(['', '123', '12345', 'abcd', null])('refuses to display %p', (bad) => {
    render(<DeliveryCode code={bad as string | null} />);
    expect(screen.queryByTestId('delivery-code')).not.toBeInTheDocument();
    expect(screen.getByText(/will appear here/)).toBeInTheDocument();
  });
});

describe('Track', () => {
  it('shows only the driver first name, vehicle, a tel link and the code', async () => {
    vi.mocked(api.getOrder).mockResolvedValue(makeOrder({ status: 'on_the_way', delivery_code: '7316' }));
    vi.mocked(api.getTracking).mockResolvedValue({
      eta_at: '2026-10-20T09:30:00Z',
      driver_first_name: 'Sipho Dlamini',
      vehicle: 'White bakkie',
      call_number: '+27110000000',
      delivered_count: null,
      lat: null,
      lng: null,
    });
    const { container } = renderAt('/orders/o1/track', '/orders/:id/track', <Track />);
    expect(await screen.findByTestId('driver-name')).toHaveTextContent(/^Sipho$/);
    expect(container.textContent).not.toContain('Dlamini');
    expect(screen.getByTestId('delivery-code').textContent).toBe('7316');
    expect(screen.getByRole('link', { name: 'Call your driver' })).toHaveAttribute('href', 'tel:+27110000000');
  });

  it('firstName strips surnames', () => {
    expect(firstName('  Thandi  Nkosi ')).toBe('Thandi');
    expect(firstName(null)).toBeNull();
    expect(firstName('')).toBeNull();
  });
});
