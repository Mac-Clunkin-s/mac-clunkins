// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ current: { session: null as unknown, profile: null as unknown, loading: false } }));
vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({ ...auth.current, signOut: vi.fn() }),
  roleHomePath: (r: string) => (r === 'buyer' ? '/orders' : r === 'supplier' ? '/supplier/jobs' : r === 'driver' ? '/driver/trips' : '/admin'),
}));

import { adminRoutes } from '../../../routes/adminRoutes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {adminRoutes}
        <Route path="/orders" element={<p>buyer home</p>} />
        <Route path="/supplier/jobs" element={<p>supplier home</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
const asRole = (role: string) => {
  auth.current = { session: {}, profile: { id: 'u', role, status: 'active', full_name: 'U' }, loading: false };
};

afterEach(cleanup);

describe('admin routes are admin-only', () => {
  const paths = ['/admin', '/admin/orders', '/admin/orders/abc', '/admin/schedule', '/admin/users', '/admin/cases', '/admin/payouts', '/admin/compliance', '/admin/reports', '/admin/settings'];
  it.each(paths)('redirects a buyer away from %s', (p) => {
    asRole('buyer');
    renderAt(p);
    expect(screen.getByText('buyer home')).toBeTruthy();
  });
  it('redirects a supplier to their home', () => {
    asRole('supplier');
    renderAt('/admin/payouts');
    expect(screen.getByText('supplier home')).toBeTruthy();
  });
  it('sends a signed-out visitor to login', () => {
    auth.current = { session: null, profile: null, loading: false };
    renderAt('/admin/settings');
    expect(screen.getByText('login page')).toBeTruthy();
  });
});
