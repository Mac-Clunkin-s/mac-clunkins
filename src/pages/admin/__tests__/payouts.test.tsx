// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'a1', role: 'admin', status: 'active', full_name: 'Admin' }, signOut: vi.fn() }),
  roleHomePath: () => '/admin',
}));
vi.mock('../api', async (orig) => {
  const real = await orig<typeof import('../api')>();
  const row = (id: string, status: string) => ({
    id, party_id: `p${id}`, party_type: 'supplier', allocation_id: 'a', trip_id: null, amount_cents: 375000,
    paystack_transfer_code: null, status, failure_reason: status === 'failed' ? 'insufficient balance' : null,
    created_at: '2026-10-01T08:00:00Z', party: { full_name: `Party ${id}`, business_name: null },
  });
  return { ...real, loadTransfers: async () => ({ data: ['queued', 'sent', 'success', 'failed', 'reversed'].map((s, i) => row(String(i), s)), error: null }) };
});

import { retryTransfer, type DbClient } from '../api';
import { canRetry, bankFileRows } from '../logic/payouts';
import AdminPayouts from '../Payouts';

afterEach(cleanup);

describe('payouts retry', () => {
  it('is allowed for failed only', () => {
    expect(['queued', 'sent', 'success', 'failed', 'reversed'].filter((s) => canRetry(s as never))).toEqual(['failed']);
  });
  it('retryTransfer refuses non-failed without calling the backend', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { rpc, from: vi.fn() } as unknown as DbClient;
    for (const status of ['queued', 'sent', 'success', 'reversed'] as const) {
      expect((await retryTransfer({ id: 't', status }, client)).error?.code).toBe('not_failed');
    }
    expect(rpc).not.toHaveBeenCalled();
    expect((await retryTransfer({ id: 't', status: 'failed' }, client)).error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('admin_retry_transfer', { p_transfer_id: 't' });
  });
  it('shows exactly one Retry button, on the failed row', async () => {
    render(<MemoryRouter><AdminPayouts /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Party 3')).toBeTruthy());
    const buttons = screen.getAllByRole('button', { name: 'Retry' });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest('tr')?.textContent).toContain('Party 3');
  });
  it('bank file lists amounts in rands', () => {
    const rows = bankFileRows([{ id: '1', party_id: 'p', party_type: 'driver', allocation_id: null, trip_id: 't', amount_cents: 42840, paystack_transfer_code: null, status: 'failed', failure_reason: null, created_at: '', party: { full_name: 'D', business_name: null } }]);
    expect(rows[1][3]).toBe('428.40');
  });
});
