import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { updateSettings, type DbClient } from '../api';
import { SETTING_DEFS, defFor, validateSetting } from '../logic/settings';

function fakeClient() {
  const calls: string[] = [];
  const audit: unknown[] = [];
  const updates: { value: unknown; key: string }[] = [];
  const client = {
    from(table: string) {
      return {
        insert: async (rows: unknown) => { calls.push(`insert:${table}`); audit.push(rows); return { error: null }; },
        update: (patch: { value: unknown }) => ({
          eq: async (_c: string, key: string) => { calls.push(`update:${table}`); updates.push({ value: patch.value, key }); return { error: null }; },
        }),
      };
    },
    rpc: vi.fn(),
  } as unknown as DbClient;
  return { client, calls, audit, updates };
}

describe('settings validation', () => {
  it('covers every settings key from the spec', () => {
    expect(SETTING_DEFS.map((d) => d.key).sort()).toEqual([
      'delivery_base_cents', 'delivery_per_bird_cents', 'delivery_per_km_cents', 'delivery_timeline', 'driver_share_pct',
      'heat_warn_c', 'issue_window_hours', 'journey_warn_hours', 'markup_pct', 'min_margin_cents', 'min_order',
      'quote_hold_minutes', 'rfq_max_km', 'rfq_min_birds', 'service_fee_pct', 'unpaid_cancel_hours',
    ]);
  });
  it('percent must be 0-100', () => {
    const d = defFor('markup_pct')!;
    expect(validateSetting(d, '15')).toEqual({ ok: true, value: 15 });
    expect(validateSetting(d, '3.5')).toEqual({ ok: true, value: 3.5 });
    expect(validateSetting(d, '0')).toEqual({ ok: true, value: 0 });
    expect(validateSetting(d, '100')).toEqual({ ok: true, value: 100 });
    expect(validateSetting(d, '101')).toEqual({ ok: false, error: 'percent_range' });
    expect(validateSetting(d, '-1')).toEqual({ ok: false, error: 'percent_range' });
    expect(validateSetting(d, 'abc')).toEqual({ ok: false, error: 'not_a_number' });
    expect(validateSetting(d, '')).toEqual({ ok: false, error: 'required' });
  });
  it('cents must be whole non-negative numbers', () => {
    const d = defFor('min_margin_cents')!;
    expect(validateSetting(d, '800')).toEqual({ ok: true, value: 800 });
    expect(validateSetting(d, '8.5')).toEqual({ ok: false, error: 'not_integer' });
    expect(validateSetting(d, '-800')).toEqual({ ok: false, error: 'negative' });
  });
  it('delivery timeline may stay unset', () => {
    expect(validateSetting(defFor('delivery_timeline')!, '  ')).toEqual({ ok: true, value: null });
  });
});

describe('updateSettings (data layer)', () => {
  it('writes audit_log with before/after BEFORE updating settings, only for changed keys', async () => {
    const { client, calls, audit, updates } = fakeClient();
    const r = await updateSettings('admin-1', { markup_pct: 15, min_margin_cents: 800 }, { markup_pct: 18, min_margin_cents: 800 }, client);
    expect(r.error).toBeNull();
    expect(r.changed).toEqual(['markup_pct']);
    expect(calls).toEqual(['insert:audit_log', 'update:settings']);
    expect(audit[0]).toEqual([{ actor_id: 'admin-1', action: 'settings.update', entity: 'settings', entity_id: 'markup_pct', before: { value: 15 }, after: { value: 18 } }]);
    expect(updates).toEqual([{ key: 'markup_pct', value: 18 }]);
  });
  it('rejects invalid values with no writes at all', async () => {
    const { client, calls } = fakeClient();
    const pct = await updateSettings('a', { markup_pct: 15 }, { markup_pct: 150 }, client);
    expect(pct.error?.code).toBe('percent_range');
    const cents = await updateSettings('a', { min_margin_cents: 800 }, { min_margin_cents: 8.5 }, client);
    expect(cents.error?.code).toBe('not_integer');
    expect(calls).toEqual([]);
  });
  it('does not change settings if the audit write fails', async () => {
    const calls: string[] = [];
    const client = {
      from: (table: string) => ({
        insert: async () => { calls.push(`insert:${table}`); return { error: { message: 'denied' } }; },
        update: () => ({ eq: async () => { calls.push('update'); return { error: null }; } }),
      }),
      rpc: vi.fn(),
    } as unknown as DbClient;
    const r = await updateSettings('a', { markup_pct: 15 }, { markup_pct: 16 }, client);
    expect(r.error?.message).toBe('denied');
    expect(calls).toEqual(['insert:audit_log']);
  });
});
