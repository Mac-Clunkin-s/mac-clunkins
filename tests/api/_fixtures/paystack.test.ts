// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PAYSTACK_SIGNATURE_HEADER, signPaystackPayload, verifyPaystackSignature } from './paystack';
import {
  chargeDisputeCreate,
  chargeSuccess,
  refundProcessed,
  signedWebhook,
  transferFailed,
  transferSuccess,
} from './webhooks';

const SECRET = 'sk_test_not_a_real_key';

describe('signPaystackPayload', () => {
  it('is HMAC-SHA512 hex of the raw body', () => {
    const body = '{"event":"charge.success"}';
    const expected = createHmac('sha512', SECRET).update(body).digest('hex');
    expect(signPaystackPayload(body, SECRET)).toBe(expected);
    expect(expected).toHaveLength(128);
  });

  it('matches a known vector (RFC 4231 test case 2, HMAC-SHA512)', () => {
    expect(signPaystackPayload('what do ya want for nothing?', 'Jefe')).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea250554' +
        '9758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    );
  });

  it('changes when the body or the key changes', () => {
    const a = signPaystackPayload('{"a":1}', SECRET);
    expect(signPaystackPayload('{"a":2}', SECRET)).not.toBe(a);
    expect(signPaystackPayload('{"a":1}', 'other')).not.toBe(a);
  });

  it('signs whitespace-sensitive raw bodies, not parsed JSON', () => {
    expect(signPaystackPayload('{"a":1}', SECRET)).not.toBe(signPaystackPayload('{ "a": 1 }', SECRET));
  });
});

describe('verifyPaystackSignature', () => {
  const body = '{"event":"charge.success","data":{}}';
  const good = signPaystackPayload(body, SECRET);

  it('accepts the right signature', () => {
    expect(verifyPaystackSignature(body, good, SECRET)).toBe(true);
    expect(verifyPaystackSignature(body, good.toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects tampered bodies, wrong keys, and malformed or missing signatures', () => {
    expect(verifyPaystackSignature(body + ' ', good, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, good, 'wrong')).toBe(false);
    expect(verifyPaystackSignature(body, 'abc', SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, '', SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, null, SECRET)).toBe(false);
  });
});

describe('webhook builders', () => {
  it('charge.success carries reference, cents amount, ZAR and metadata', () => {
    const e = chargeSuccess({ reference: 'ref_1', amountCents: 123_450, metadata: { order_id: 'o1' } });
    expect(e.event).toBe('charge.success');
    expect(e.data).toMatchObject({ status: 'success', reference: 'ref_1', amount: 123_450, currency: 'ZAR', metadata: { order_id: 'o1' } });
  });

  it('transfer.success and transfer.failed share a reference and differ in status', () => {
    const ok = transferSuccess({ reference: 'tr_1', amountCents: 5000 });
    const bad = transferFailed({ reference: 'tr_1', amountCents: 5000 });
    expect(ok.event).toBe('transfer.success');
    expect(bad.event).toBe('transfer.failed');
    expect(ok.data).toMatchObject({ status: 'success', reference: 'tr_1', amount: 5000 });
    expect(bad.data).toMatchObject({ status: 'failed', reference: 'tr_1', amount: 5000 });
  });

  it('refund.processed points at the original charge', () => {
    const e = refundProcessed({ transactionReference: 'ref_1', amountCents: 2000 });
    expect(e.event).toBe('refund.processed');
    expect(e.data).toMatchObject({ status: 'processed', transaction_reference: 'ref_1', amount: 2000 });
  });

  it('charge.dispute.create nests the disputed transaction', () => {
    const e = chargeDisputeCreate({ transactionReference: 'ref_1', amountCents: 9900 });
    expect(e.event).toBe('charge.dispute.create');
    expect(e.data).toMatchObject({ refund_amount: 9900, transaction: { reference: 'ref_1', amount: 9900 } });
  });

  it('every builder emits integer cents', () => {
    const amounts = [
      chargeSuccess({ reference: 'a', amountCents: 100 }).data.amount,
      transferSuccess({ reference: 'a', amountCents: 100 }).data.amount,
      transferFailed({ reference: 'a', amountCents: 100 }).data.amount,
      refundProcessed({ transactionReference: 'a', amountCents: 100 }).data.amount,
    ];
    for (const a of amounts) expect(Number.isInteger(a)).toBe(true);
  });

  it('assigns distinct ids unless one is given', () => {
    const a = chargeSuccess({ reference: 'a', amountCents: 1 }).data.id;
    const b = chargeSuccess({ reference: 'a', amountCents: 1 }).data.id;
    expect(a).not.toBe(b);
    expect(chargeSuccess({ reference: 'a', amountCents: 1, id: 7 }).data.id).toBe(7);
  });
});

describe('signedWebhook', () => {
  it('signs exactly the body it returns and sets the header', () => {
    const wh = signedWebhook(chargeSuccess({ reference: 'ref_9', amountCents: 100 }), SECRET);
    expect(JSON.parse(wh.body).data.reference).toBe('ref_9');
    expect(wh.headers[PAYSTACK_SIGNATURE_HEADER]).toBe(wh.signature);
    expect(verifyPaystackSignature(wh.body, wh.signature, SECRET)).toBe(true);
    expect(wh.headers['content-type']).toBe('application/json');
  });
});
