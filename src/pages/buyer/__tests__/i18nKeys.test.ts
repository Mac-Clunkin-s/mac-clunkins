import { describe, expect, it } from 'vitest';
import en from '../../../i18n/en.buyer.json';
import { t } from '../i18n-shim';

const raw = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const has = (key: string) => key.split('.').reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), en) !== undefined;

describe('buyer i18n keys', () => {
  const src = Object.entries(raw)
    .filter(([p]) => !p.includes('__tests__'))
    .map(([, code]) => code)
    .join('\n');

  it('every literal buyer.* key used in source exists in en.buyer.json', () => {
    const keys = [...src.matchAll(/['"`](buyer\.[A-Za-z0-9_.]+)['"`]/g)].map((m) => m[1]).filter((k) => !k.endsWith('.'));
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });

  it('every dynamically built key family is fully covered', () => {
    const fam: Record<string, string[]> = {
      'buyer.birdType': ['broiler', 'hardbody', 'indigenous'],
      'buyer.weightBand': ['under_1_5kg', '1_5_to_2kg', '2_to_2_5kg', '2_5_to_3kg', 'over_3kg'],
      'buyer.status': ['placed', 'paid', 'scheduled', 'ready', 'on_the_way', 'delivered', 'settled', 'cancelled', 'refunded'],
      'buyer.caseType': ['short_count', 'sick_injured', 'died', 'late', 'failed_delivery', 'payment', 'other'],
      'buyer.caseStatus': ['open', 'in_review', 'awaiting_info', 'resolved', 'closed'],
      'buyer.case.kind': ['status', 'evidence', 'refund'],
      'buyer.pay.method': ['card', 'eft', 'capitec_pay', 'qr'],
      'buyer.detail.payment': ['none', 'pending', 'succeeded', 'failed', 'refunded', 'disputed'],
      'buyer.profile.lang': ['en', 'zu', 'st', 'tn'],
      'buyer.profile.notify': ['whatsapp', 'email', 'sms'],
      'buyer.orders.filter': ['all', 'in_progress', 'delivered', 'cancelled'],
      'buyer.delivered.thumbs': ['up', 'down'],
      'buyer.quoteReady.status': ['open', 'accepted', 'expired', 'declined'],
      'buyer.newOrder.requestReason': ['too_many', 'too_far', 'no_match'],
    };
    const missing = Object.entries(fam).flatMap(([p, ks]) => ks.map((k) => `${p}.${k}`)).filter((k) => !has(k));
    expect(missing).toEqual([]);
  });

  it('t() interpolates and falls back to the key', () => {
    expect(t('buyer.newOrder.errors.minQuantity', { min: 10 })).toBe('The minimum order is 10 birds.');
    expect(t('buyer.nope.missing')).toBe('buyer.nope.missing');
  });
});
