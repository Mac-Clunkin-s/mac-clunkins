// Outbound money: send queued payouts, start refunds. Network and database are injected.
import { refundBody, transferBody } from './paystack.ts';

export interface RpcResult { data: any; error: { message: string } | null }
export interface TransferDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  paystackPost: (path: string, body: unknown) => Promise<{ ok: boolean; message?: string; data?: any }>;
}

export async function processTransferQueue(deps: TransferDeps, limit = 20) {
  const claimed = await deps.rpc('claim_transfers', { p_limit: limit });
  if (claimed.error) throw new Error(`claim_transfers: ${claimed.error.message}`);
  const summary = { claimed: 0, sent: 0, failed: 0 };
  for (const t of (claimed.data ?? []) as Array<{ id: string; amount_cents: number; recipient_code: string | null; reference: string }>) {
    summary.claimed++;
    if (!t.recipient_code) {
      await deps.rpc('mark_transfer_failed', { p_id: t.id, p_reason: 'no_recipient_code' });
      summary.failed++;
      continue;
    }
    let res;
    try {
      res = await deps.paystackPost('/transfer', transferBody({ amountCents: t.amount_cents, recipientCode: t.recipient_code, reference: t.reference }));
    } catch (e) {
      res = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    if (res.ok && res.data?.transfer_code) {
      await deps.rpc('mark_transfer_sent', { p_id: t.id, p_transfer_code: res.data.transfer_code });
      summary.sent++;
    } else {
      await deps.rpc('mark_transfer_failed', { p_id: t.id, p_reason: res.message ?? 'paystack error' });
      summary.failed++;
    }
  }
  return summary;
}

export async function startRefund(deps: TransferDeps, refundId: string) {
  const b = await deps.rpc('begin_refund', { p_refund_id: refundId });
  if (b.error) throw new Error(`begin_refund: ${b.error.message}`);
  const target = b.data as { reference: string; amount_cents: number };
  let res;
  try { res = await deps.paystackPost('/refund', refundBody({ reference: target.reference, amountCents: target.amount_cents })); }
  catch (e) { res = { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  await deps.rpc('complete_refund_request', {
    p_refund_id: refundId, p_paystack_refund_id: res.data?.id != null ? String(res.data.id) : null, p_ok: !!res.ok,
  });
  return { ok: !!res.ok, message: res.message };
}
