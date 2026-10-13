// Paystack webhook handling with every side effect injected, so node can test the whole
// flow (signature -> idempotency -> re-verify -> database) without a network or a database.
import { eventKey, verifySignature, ZAR } from './paystack.ts';

export interface RpcResult { data: any; error: { message: string } | null }
export interface WebhookDeps {
  secret: string;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  /** GET /transaction/verify/:reference, already unwrapped to Paystack's `data`. */
  verifyTransaction: (reference: string) => Promise<{ status: string; amount: number; currency: string; reference: string; channel?: string; fees?: number | null }>;
}
export interface WebhookResponse { status: number; body: Record<string, unknown> }

const HANDLED = ['charge.success', 'transfer.success', 'transfer.failed', 'transfer.reversed', 'refund.processed', 'charge.dispute.create'];

export async function handlePaystackWebhook(deps: WebhookDeps, rawBody: string, signature: string | null): Promise<WebhookResponse> {
  // 1. Authenticate before parsing or touching anything.
  if (!verifySignature(rawBody, signature, deps.secret)) {
    return { status: 401, body: { error: 'invalid_signature' } };
  }
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return { status: 400, body: { error: 'invalid_json' } }; }

  if (!HANDLED.includes(payload?.event)) {
    return { status: 200, body: { ignored: payload?.event ?? 'unknown' } };
  }
  let key: string;
  try { key = eventKey(payload); } catch { return { status: 400, body: { error: 'no_event_key' } }; }

  // 2. Idempotency: the database primary key decides, atomically.
  const rec = await deps.rpc('record_webhook_event', { p_key: key, p_event: payload.event, p_payload: payload });
  if (rec.error) return { status: 500, body: { error: 'record_failed' } };
  if (rec.data === 'duplicate') return { status: 200, body: { duplicate: true } };

  // 3. Process; on a thrown/db error mark the event failed so Paystack's retry is accepted.
  try {
    const outcome = await process(deps, payload);
    await deps.rpc('finish_webhook_event', { p_key: key, p_ok: true, p_error: null });
    return { status: 200, body: { ok: true, outcome } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deps.rpc('finish_webhook_event', { p_key: key, p_ok: false, p_error: message.slice(0, 500) });
    return { status: 500, body: { error: 'processing_failed' } };
  }
}

async function call(deps: WebhookDeps, fn: string, args: Record<string, unknown>) {
  const r = await deps.rpc(fn, args);
  if (r.error) throw new Error(`${fn}: ${r.error.message}`);
  return r.data;
}

async function process(deps: WebhookDeps, payload: any): Promise<string> {
  const d = payload.data ?? {};
  switch (payload.event) {
    case 'charge.success': {
      // "Verify each transaction before fulfilling": never trust the webhook body for money.
      const v = await deps.verifyTransaction(d.reference);
      if (v.status !== 'success' || v.reference !== d.reference || v.currency !== ZAR || v.amount !== d.amount) {
        await call(deps, 'record_webhook_event', { p_key: `verify_mismatch:${d.reference}`, p_event: 'verify_mismatch', p_payload: { event: payload.event, data: d, verified: v } });
        return 'verification_failed';
      }
      const r = await call(deps, 'mark_order_paid', {
        p_reference: v.reference, p_amount_cents: v.amount, p_channel: v.channel ?? d.channel ?? null, p_fee_cents: v.fees ?? d.fees ?? null,
      });
      return r?.result ?? 'paid';
    }
    case 'transfer.success':
      return (await call(deps, 'mark_transfer_result', { p_ref: d.transfer_code ?? d.reference, p_status: 'success', p_reason: null }))?.result;
    case 'transfer.failed':
      return (await call(deps, 'mark_transfer_result', { p_ref: d.transfer_code ?? d.reference, p_status: 'failed', p_reason: d.reason ?? 'transfer failed' }))?.result;
    case 'transfer.reversed':
      return (await call(deps, 'mark_transfer_result', { p_ref: d.transfer_code ?? d.reference, p_status: 'reversed', p_reason: d.reason ?? 'transfer reversed' }))?.result;
    case 'refund.processed':
      return (await call(deps, 'apply_refund_processed', {
        p_transaction_ref: d.transaction_reference ?? d.transaction?.reference, p_amount_cents: d.amount, p_paystack_refund_id: d.id != null ? String(d.id) : null,
      }))?.result;
    case 'charge.dispute.create':
      return (await call(deps, 'record_dispute', {
        p_transaction_ref: d.transaction?.reference ?? d.transaction_reference, p_dispute_id: d.id != null ? String(d.id) : null, p_detail: d,
      }))?.result;
    default:
      return 'ignored';
  }
}
