import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { advanceCase, type DbClient } from '../api';
import { CASE_FLOW, allowedNext, isForwardTransition, validateResolution } from '../logic/cases';

describe('case status flow', () => {
  it('has the documented order', () => {
    expect(CASE_FLOW).toEqual(['open', 'in_review', 'awaiting_info', 'resolved', 'closed']);
  });
  it('only moves forward', () => {
    expect(isForwardTransition('open', 'in_review')).toBe(true);
    expect(isForwardTransition('in_review', 'resolved')).toBe(true);
    expect(isForwardTransition('awaiting_info', 'in_review')).toBe(false);
    expect(isForwardTransition('resolved', 'open')).toBe(false);
    expect(isForwardTransition('closed', 'resolved')).toBe(false);
    expect(isForwardTransition('open', 'open')).toBe(false);
    expect(allowedNext('closed')).toEqual([]);
    expect(allowedNext('awaiting_info')).toEqual(['resolved', 'closed']);
  });
  it('advanceCase refuses a backward move without calling the backend', async () => {
    const rpc = vi.fn();
    const r = await advanceCase({ caseId: 'c1', from: 'resolved', to: 'in_review' }, { rpc, from: vi.fn() } as unknown as DbClient);
    expect(r.error?.code).toBe('not_forward');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('advanceCase sends a forward move and requires a resolution when resolving', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { rpc, from: vi.fn() } as unknown as DbClient;
    expect((await advanceCase({ caseId: 'c1', from: 'in_review', to: 'resolved' }, client)).error?.code).toBe('resolution_required');
    expect(rpc).not.toHaveBeenCalled();
    const ok = await advanceCase({ caseId: 'c1', from: 'in_review', to: 'resolved', resolution: 'refund', amountCents: 5000, costTo: 'supplier' }, client);
    expect(ok.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('admin_advance_case', expect.objectContaining({ p_case_id: 'c1', p_status: 'resolved', p_resolution: 'refund', p_amount_cents: 5000, p_cost_to: 'supplier' }));
  });
  it('resolution rules', () => {
    expect(validateResolution({ resolution: 'refund', amountCents: null, costOwner: 'supplier' })).toBe('amount_required');
    expect(validateResolution({ resolution: 'refund', amountCents: 0, costOwner: 'supplier' })).toBe('amount_invalid');
    expect(validateResolution({ resolution: 'credit', amountCents: 100, costOwner: '' })).toBe('cost_owner_required');
    expect(validateResolution({ resolution: 'none', amountCents: null, costOwner: '' })).toBeNull();
  });
});
