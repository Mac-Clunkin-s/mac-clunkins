import { describe, expect, it } from 'vitest';
import { approvalState, readyBlockers, REQUIRED_SUPPLIER_DOCS, tabForStatus, weekStartISO } from '../logic';
import type { ComplianceDoc } from '../types';

const docs = (status: ComplianceDoc['status'], expires_on: string | null = null): ComplianceDoc[] =>
  REQUIRED_SUPPLIER_DOCS.map((kind) => ({ id: kind, kind, file_path: 'x', status, expires_on, notes: null }));

describe('supplier approval', () => {
  const today = new Date('2026-10-13T08:00:00Z');
  it('is incomplete with missing docs, in review once uploaded, approved when all approved', () => {
    expect(approvalState([], today)).toBe('incomplete');
    expect(approvalState(docs('uploaded'), today)).toBe('in_review');
    expect(approvalState(docs('approved', '2027-01-01'), today)).toBe('approved');
  });
  it('an expired approved document pauses the supplier', () => {
    expect(approvalState(docs('approved', '2026-10-12'), today)).toBe('expired');
  });
});

describe('job helpers', () => {
  it('maps statuses to tabs and hides declined', () => {
    expect(tabForStatus('offered')).toBe('new');
    expect(tabForStatus('accepted')).toBe('active');
    expect(tabForStatus('ready')).toBe('active');
    expect(tabForStatus('collected')).toBe('done');
    expect(tabForStatus('declined')).toBeNull();
  });
  it('week starts on Monday', () => {
    expect(weekStartISO(new Date(2026, 9, 13))).toBe('2026-10-12');
    expect(weekStartISO(new Date(2026, 9, 18))).toBe('2026-10-12');
    expect(weekStartISO(new Date(2026, 9, 13), 1)).toBe('2026-10-19');
  });
  it('Mark ready needs count, crates, welfare, photo and an unexpired permit', () => {
    const now = new Date('2026-10-13T08:00:00Z');
    const ok = { birds_counted: 100, crates: 10, welfare_ok: true, load_photo_path: 'a', removal_permit_path: 'b', permit_valid_until: '2026-10-14T08:00:00Z' };
    expect(readyBlockers(ok, now)).toEqual([]);
    expect(readyBlockers({ ...ok, permit_valid_until: '2026-10-13T07:00:00Z' }, now)).toEqual(['supplier.job.permit_expired']);
    expect(readyBlockers({ ...ok, removal_permit_path: null }, now)).toEqual(['supplier.job.need_permit']);
    expect(readyBlockers({ ...ok, welfare_ok: false, load_photo_path: null }, now)).toHaveLength(2);
  });
});
