// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_FOR,
  assertNoForbiddenKeys,
  findForbiddenKeys,
  findNonFirstNames,
  recordNetwork,
} from './privacy';

const asResponse = (body: unknown, url = 'http://x/rest/v1/orders') => ({
  json: async () => body,
  url: () => url,
});

describe('findForbiddenKeys', () => {
  it('finds a top-level key, case-insensitively for strings', () => {
    expect(findForbiddenKeys({ Supplier_Name: 'Farm' }, ['supplier_name'])).toEqual(['Supplier_Name']);
  });

  it('finds keys nested in objects and arrays and reports the path', () => {
    const payload = { data: [{ id: 1 }, { id: 2, quote: { supplier_price_cents: 900 } }] };
    expect(findForbiddenKeys(payload, [/price/])).toEqual(['data.1.quote.supplier_price_cents']);
  });

  it('matches regexes against the key, not the value', () => {
    expect(findForbiddenKeys({ note: 'supplier_id' }, [/^supplier_id$/])).toEqual([]);
  });

  it('returns nothing for clean payloads, primitives and null', () => {
    expect(findForbiddenKeys({ a: 1, b: [1, 2, { c: 'x' }] }, ['phone'])).toEqual([]);
    expect(findForbiddenKeys(null, ['phone'])).toEqual([]);
    expect(findForbiddenKeys('phone', ['phone'])).toEqual([]);
  });

  it('survives circular structures', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(findForbiddenKeys(a, ['phone'])).toEqual([]);
  });

  it('honours allowPaths by exact string and by regex', () => {
    const payload = { me: { phone: '1' }, other: { phone: '2' } };
    expect(findForbiddenKeys(payload, ['phone'], { allowPaths: ['me.phone'] })).toEqual(['other.phone']);
    expect(findForbiddenKeys(payload, ['phone'], { allowPaths: [/^me\./] })).toEqual(['other.phone']);
  });
});

describe('assertNoForbiddenKeys', () => {
  it('passes for a clean response', async () => {
    await expect(assertNoForbiddenKeys(asResponse([{ id: 1, status: 'paid' }]), [/supplier/i])).resolves.toBeUndefined();
  });

  it('throws naming the url and every leaking path', async () => {
    const response = asResponse({ rows: [{ supplier_id: 'a', supplier_name: 'b' }] }, 'http://x/rest/v1/quotes');
    await expect(assertNoForbiddenKeys(response, [/^supplier_/])).rejects.toThrow(
      /http:\/\/x\/rest\/v1\/quotes.*rows\.0\.supplier_id, rows\.0\.supplier_name/,
    );
  });

  it('accepts an already-parsed payload', async () => {
    await expect(assertNoForbiddenKeys({ phone: '082' }, ['phone'])).rejects.toThrow(/phone/);
  });

  it('ignores non-JSON bodies', async () => {
    const response = {
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    };
    await expect(assertNoForbiddenKeys(response, ['phone'])).resolves.toBeUndefined();
  });

  it('applies allowPaths', async () => {
    await expect(assertNoForbiddenKeys({ me: { phone: '1' } }, ['phone'], { allowPaths: ['me.phone'] })).resolves.toBeUndefined();
  });
});

describe('FORBIDDEN_FOR role sets', () => {
  it('buyer: blocks supplier name, id and price keys', () => {
    const leaks = findForbiddenKeys(
      { supplier_id: 1, supplierName: 'x', supplier_price_cents: 1, qty: 3, status: 'paid', total_cents: 5000 },
      FORBIDDEN_FOR.buyer,
    );
    expect(leaks.sort()).toEqual(['supplierName', 'supplier_id', 'supplier_price_cents']);
  });

  it('supplier: blocks buyer name, phone, address and price keys but not their own job fields', () => {
    const leaks = findForbiddenKeys(
      {
        buyer_name: 'a',
        buyer_phone: 'b',
        delivery_address: 'c',
        address_line1: 'd',
        retail_price_cents: 1,
        job_id: 1,
        qty: 20,
        supplier_price_cents: 900,
        pickup_window: 'x',
      },
      FORBIDDEN_FOR.supplier,
    );
    expect(leaks.sort()).toEqual(['address_line1', 'buyer_name', 'buyer_phone', 'delivery_address', 'retail_price_cents']);
  });

  it('driver: blocks supplier prices and buyer surnames but allows buyer first names', () => {
    const leaks = findForbiddenKeys(
      { supplier_price_cents: 1, buyer_last_name: 'M', buyer_email: 'e', buyer_first_name: 'Thandi', trip_id: 3 },
      FORBIDDEN_FOR.driver,
    );
    expect(leaks.sort()).toEqual(['buyer_email', 'buyer_last_name', 'supplier_price_cents']);
  });
});

describe('findNonFirstNames', () => {
  it('flags multi-word values at first-name keys only', () => {
    const payload = { trips: [{ buyer_first_name: 'Thandi' }, { buyer_first_name: 'Thandi Mokoena' }], note: 'a b' };
    expect(findNonFirstNames(payload, ['buyer_first_name'])).toEqual(['trips.1.buyer_first_name']);
  });
});

describe('recordNetwork', () => {
  type Handler = (r: { url(): string; json(): Promise<unknown> }) => void;

  const fakePage = () => {
    const handlers = new Set<Handler>();
    return {
      page: {
        on: (_: string, h: Handler) => void handlers.add(h),
        off: (_: string, h: Handler) => void handlers.delete(h),
      },
      emit: (url: string, body: unknown, ok = true) =>
        handlers.forEach((h) =>
          h({ url: () => url, json: ok ? async () => body : async () => Promise.reject(new Error('not json')) }),
        ),
      listeners: () => handlers.size,
    };
  };

  it('captures filtered JSON responses and detects a leak', async () => {
    const fake = fakePage();
    const recorder = recordNetwork(fake.page as never);
    fake.emit('http://x/rest/v1/orders', [{ supplier_name: 'Farm' }]);
    fake.emit('http://x/assets/app.js', { supplier_name: 'ignored: not an API url' });
    fake.emit('http://x/rest/v1/blob', null, false);
    await expect(recorder.assertClean(FORBIDDEN_FOR.buyer)).rejects.toThrow(/supplier_name/);
    expect(recorder.count).toBe(1);
  });

  it('passes when every captured response is clean, and stop() detaches', async () => {
    const fake = fakePage();
    const recorder = recordNetwork(fake.page as never);
    fake.emit('http://x/rest/v1/orders', [{ id: 1, status: 'paid' }]);
    await expect(recorder.assertClean(FORBIDDEN_FOR.buyer)).resolves.toBeUndefined();
    recorder.stop();
    expect(fake.listeners()).toBe(0);
  });

  it('assertFirstNamesOnly fails on a full name', async () => {
    const fake = fakePage();
    const recorder = recordNetwork(fake.page as never);
    fake.emit('http://x/rest/v1/trips', [{ buyer_first_name: 'Thandi Mokoena' }]);
    await expect(recorder.assertFirstNamesOnly(['buyer_first_name'])).rejects.toThrow(/buyer_first_name/);
  });
});
