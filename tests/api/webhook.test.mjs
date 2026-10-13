// Paystack webhook: HMAC-SHA512 signature, replay protection, transaction re-verification,
// event routing. The handler's database and network are faked, so this runs without either;
// the SQL side of the same flow is covered in payments.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { computeSignature, verifySignature, eventKey, mapChannel, initializeBody, transferBody } from '../../supabase/functions/_shared/paystack.ts';
import { handlePaystackWebhook } from '../../supabase/functions/_shared/webhook.ts';
import { handleInit } from '../../supabase/functions/_shared/init.ts';
import { processTransferQueue } from '../../supabase/functions/_shared/transfers.ts';

const SECRET = 'sk_test_unit_only_not_a_real_key';
const sign = (body, secret = SECRET) => createHmac('sha512', secret).update(body).digest('hex');

const chargeSuccess = (over = {}) => JSON.stringify({
  event: 'charge.success',
  data: { id: 4099260516, reference: 'mcc_mc1053_abc', amount: 498508, currency: 'ZAR', status: 'success', channel: 'card', fees: 16746, ...over },
});

/** In-memory stand-in for the database functions the handler calls. */
function fakeDb({ failOnce = false } = {}) {
  const events = new Map(); const calls = []; let failures = failOnce ? 1 : 0;
  return {
    calls, events,
    rpc: async (fn, args) => {
      calls.push([fn, args]);
      if (fn === 'record_webhook_event') {
        const prior = events.get(args.p_key);
        if (!prior) { events.set(args.p_key, 'received'); return { data: 'new', error: null }; }
        if (prior === 'failed') { events.set(args.p_key, 'received'); return { data: 'retry', error: null }; }
        return { data: 'duplicate', error: null };
      }
      if (fn === 'finish_webhook_event') { events.set(args.p_key, args.p_ok ? 'processed' : 'failed'); return { data: null, error: null }; }
      if (fn === 'mark_order_paid' && failures > 0) { failures--; return { data: null, error: { message: 'db down' } }; }
      return { data: { result: 'ok' }, error: null };
    },
  };
}
const verified = (over = {}) => async (reference) => ({ status: 'success', amount: 498508, currency: 'ZAR', reference, channel: 'card', fees: 16746, ...over });
const sideEffects = (db) => db.calls.filter(([f]) => !['record_webhook_event', 'finish_webhook_event'].includes(f));

test('signature: valid, tampered body, wrong key, missing, malformed, wrong length', () => {
  const body = chargeSuccess();
  assert.equal(verifySignature(body, sign(body), SECRET), true);
  assert.equal(verifySignature(body, sign(body).toUpperCase(), SECRET), true);       // hex case-insensitive
  assert.equal(verifySignature(body + ' ', sign(body), SECRET), false);              // one byte changed
  assert.equal(verifySignature(body, sign(body, 'sk_test_other'), SECRET), false);
  assert.equal(verifySignature(body, null, SECRET), false);
  assert.equal(verifySignature(body, '', SECRET), false);
  assert.equal(verifySignature(body, 'abc', SECRET), false);
  assert.equal(verifySignature(body, sign(body), ''), false);                        // unconfigured secret never validates
  assert.equal(computeSignature(body, SECRET), sign(body));
  assert.equal(computeSignature(body, SECRET).length, 128);                          // sha512 hex
});

test('a bad signature is rejected with 401 and touches nothing', async () => {
  const db = fakeDb(); const body = chargeSuccess();
  const res = await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: verified() }, body, 'deadbeef');
  assert.equal(res.status, 401);
  assert.equal(db.calls.length, 0);
  const missing = await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: verified() }, body, null);
  assert.equal(missing.status, 401);
});

test('charge.success: re-verifies with Paystack, then marks the order paid with VERIFIED values', async () => {
  const db = fakeDb(); const body = chargeSuccess({ fees: 1 });                     // webhook body fee is not trusted
  let verifyCalls = 0;
  const res = await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: async (r) => { verifyCalls++; return verified()(r); } }, body, sign(body));
  assert.equal(res.status, 200);
  assert.equal(verifyCalls, 1);
  const [fn, args] = sideEffects(db)[0];
  assert.equal(fn, 'mark_order_paid');
  assert.deepEqual(args, { p_reference: 'mcc_mc1053_abc', p_amount_cents: 498508, p_channel: 'card', p_fee_cents: 16746 });
});

test('replay: the same event delivered twice is processed once', async () => {
  const db = fakeDb(); const body = chargeSuccess(); const sig = sign(body);
  const deps = { secret: SECRET, rpc: db.rpc, verifyTransaction: verified() };
  const first = await handlePaystackWebhook(deps, body, sig);
  const second = await handlePaystackWebhook(deps, body, sig);
  const third = await handlePaystackWebhook(deps, body, sig);
  assert.equal(first.status, 200); assert.deepEqual(second.body, { duplicate: true }); assert.deepEqual(third.body, { duplicate: true });
  assert.equal(sideEffects(db).filter(([f]) => f === 'mark_order_paid').length, 1);
  // a different transaction is a different event
  const other = chargeSuccess({ id: 4099260517, reference: 'mcc_mc1054_def' });
  await handlePaystackWebhook(deps, other, sign(other));
  assert.equal(sideEffects(db).filter(([f]) => f === 'mark_order_paid').length, 2);
});

test('a processing failure returns 500 and the retry is accepted (not swallowed as a duplicate)', async () => {
  const db = fakeDb({ failOnce: true }); const body = chargeSuccess(); const sig = sign(body);
  const deps = { secret: SECRET, rpc: db.rpc, verifyTransaction: verified() };
  const first = await handlePaystackWebhook(deps, body, sig);
  assert.equal(first.status, 500);
  assert.equal(db.events.get(eventKey(JSON.parse(body))), 'failed');
  const retry = await handlePaystackWebhook(deps, body, sig);
  assert.equal(retry.status, 200);
  assert.equal(db.events.get(eventKey(JSON.parse(body))), 'processed');
});

test('verification mismatch (status, amount, currency, reference) never marks paid', async () => {
  for (const bad of [{ status: 'failed' }, { amount: 100 }, { currency: 'USD' }, { reference: 'someone_elses' }]) {
    const db = fakeDb(); const body = chargeSuccess();
    const res = await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: verified(bad) }, body, sign(body));
    assert.equal(res.status, 200, JSON.stringify(bad));
    assert.equal(res.body.outcome, 'verification_failed');
    assert.equal(sideEffects(db).filter(([f]) => f === 'mark_order_paid').length, 0, JSON.stringify(bad));
  }
});

test('a Paystack outage during verification fails the event for retry', async () => {
  const db = fakeDb(); const body = chargeSuccess();
  const res = await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: async () => { throw new Error('timeout'); } }, body, sign(body));
  assert.equal(res.status, 500);
  assert.equal(sideEffects(db).length, 0);
});

test('transfer, refund and dispute events are routed to the right database functions', async () => {
  const cases = [
    [{ event: 'transfer.success', data: { id: 1, transfer_code: 'TRF_a' } }, 'mark_transfer_result', { p_ref: 'TRF_a', p_status: 'success', p_reason: null }],
    [{ event: 'transfer.failed', data: { id: 2, transfer_code: 'TRF_b', reason: 'Could not resolve account' } }, 'mark_transfer_result', { p_ref: 'TRF_b', p_status: 'failed', p_reason: 'Could not resolve account' }],
    [{ event: 'transfer.reversed', data: { id: 3, transfer_code: 'TRF_c' } }, 'mark_transfer_result', { p_ref: 'TRF_c', p_status: 'reversed', p_reason: 'transfer reversed' }],
    [{ event: 'refund.processed', data: { id: 77, transaction_reference: 'mcc_x', amount: 1234 } }, 'apply_refund_processed', { p_transaction_ref: 'mcc_x', p_amount_cents: 1234, p_paystack_refund_id: '77' }],
  ];
  for (const [payload, fn, args] of cases) {
    const db = fakeDb(); const body = JSON.stringify(payload);
    const res = await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: verified() }, body, sign(body));
    assert.equal(res.status, 200, payload.event);
    assert.deepEqual(sideEffects(db)[0], [fn, args], payload.event);
  }
  const db = fakeDb(); const d = JSON.stringify({ event: 'charge.dispute.create', data: { id: 55, transaction: { reference: 'mcc_y' } } });
  await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: verified() }, d, sign(d));
  assert.equal(sideEffects(db)[0][0], 'record_dispute');
  assert.equal(sideEffects(db)[0][1].p_transaction_ref, 'mcc_y');
});

test('unhandled events are acknowledged (200) without side effects; junk bodies are 400', async () => {
  const db = fakeDb(); const body = JSON.stringify({ event: 'customeridentification.success', data: {} });
  const res = await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: verified() }, body, sign(body));
  assert.deepEqual([res.status, db.calls.length], [200, 0]);
  const junk = 'not json';
  assert.equal((await handlePaystackWebhook({ secret: SECRET, rpc: db.rpc, verifyTransaction: verified() }, junk, sign(junk))).status, 400);
});

test('event keys, channels and request bodies', () => {
  assert.equal(eventKey({ event: 'charge.success', data: { id: 9, reference: 'r' } }), 'charge.success:9');
  assert.equal(eventKey({ event: 'transfer.success', data: { transfer_code: 'TRF_1' } }), 'transfer.success:TRF_1');
  assert.equal(eventKey({ id: 'evt_1', event: 'x', data: {} }), 'x:evt_1');
  assert.throws(() => eventKey({ event: 'x', data: {} }));
  assert.deepEqual(['card', 'bank', 'eft', 'capitec_pay', 'qr', 'ussd', undefined].map(mapChannel), ['card', 'eft', 'eft', 'capitec_pay', 'qr', null, null]);
  const init = initializeBody({ email: 'a@b.co', amountCents: 498508, reference: 'r1', callbackUrl: 'https://x/y' });
  assert.deepEqual([init.amount, init.currency], [498508, 'ZAR']);
  assert.ok(!JSON.stringify(transferBody({ amountCents: 1, recipientCode: 'RCP', reference: 'mcct_1' })).match(/MC-\d|supplier|buyer/i));
});

test('paystack-init: accepts the quote, starts the payment, returns only the checkout URL and the order number', async () => {
  const calls = [];
  const deps = {
    callbackUrl: 'https://app.test/paid',
    userRpc: async (fn, a) => { calls.push(fn); return fn === 'accept_quote_create_order'
      ? { data: { order_id: 'o1', number: 'MC-1053' }, error: null }
      : { data: { reference: 'mcc_mc1053_x', amount_cents: 498508, email: 'b@x.co', order_number: 'MC-1053' }, error: null }; },
    paystackPost: async (path, body) => { calls.push(path); assert.equal(body.amount, 498508); return { ok: true, data: { authorization_url: 'https://checkout.paystack.com/abc' } }; },
  };
  const res = await handleInit(deps, { quote_id: 'q1' });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['amount_cents', 'authorization_url', 'order_number', 'reference']);
  assert.deepEqual(calls, ['accept_quote_create_order', 'start_payment', '/transaction/initialize']);
  const expired = await handleInit({ ...deps, userRpc: async () => ({ data: null, error: { message: 'quote_expired' } }) }, { quote_id: 'q1' });
  assert.deepEqual([expired.status, expired.body.error], [409, 'quote_expired']);
  assert.equal((await handleInit(deps, {})).status, 400);
});

test('paystack-transfer: sends queued payouts, records failures, fails fast without a recipient', async () => {
  const log = [];
  const deps = {
    rpc: async (fn, a) => {
      log.push([fn, a]);
      if (fn === 'claim_transfers') return { data: [
        { id: 't1', amount_cents: 375000, recipient_code: 'RCP_1', reference: 'mcct_1' },
        { id: 't2', amount_cents: 42840, recipient_code: null, reference: 'mcct_2' },
        { id: 't3', amount_cents: 100, recipient_code: 'RCP_3', reference: 'mcct_3' }], error: null };
      return { data: null, error: null };
    },
    paystackPost: async (path, body) => body.recipient === 'RCP_1' ? { ok: true, data: { transfer_code: 'TRF_1' } } : { ok: false, message: 'Insufficient balance' },
  };
  assert.deepEqual(await processTransferQueue(deps), { claimed: 3, sent: 1, failed: 2 });
  assert.deepEqual(log.slice(1), [
    ['mark_transfer_sent', { p_id: 't1', p_transfer_code: 'TRF_1' }],
    ['mark_transfer_failed', { p_id: 't2', p_reason: 'no_recipient_code' }],
    ['mark_transfer_failed', { p_id: 't3', p_reason: 'Insufficient balance' }]]);
});
