// paystack-init logic: quote -> unpaid order -> payment reference -> Paystack checkout URL.
import { initializeBody } from './paystack.ts';

export interface RpcResult { data: any; error: { message: string } | null }
export interface InitDeps {
  /** rpc as the signed-in caller (their JWT), so RLS/ownership checks apply. */
  userRpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  paystackPost: (path: string, body: unknown) => Promise<{ ok: boolean; message?: string; data?: any }>;
  callbackUrl?: string;
}

const KNOWN: Record<string, number> = {
  quote_expired: 409, quote_not_priced: 409, quote_accepted: 409, quote_declined: 409, quote_expired_: 409, order_not_payable: 409,
};

export async function handleInit(deps: InitDeps, body: { quote_id?: string; issue_link?: boolean }) {
  if (!body?.quote_id) return { status: 400, body: { error: 'quote_id_required' } };

  const acc = await deps.userRpc('accept_quote_create_order', { p_quote_id: body.quote_id });
  if (acc.error) return mapError(acc.error.message);
  const pay = await deps.userRpc('start_payment', { p_order_id: acc.data.order_id });
  if (pay.error) return mapError(pay.error.message);
  const p = pay.data as { reference: string; amount_cents: number; email: string | null; order_number: string };
  if (!p.email) return { status: 422, body: { error: 'buyer_email_missing' } };

  const res = await deps.paystackPost('/transaction/initialize', initializeBody({
    email: p.email, amountCents: p.amount_cents, reference: p.reference, callbackUrl: deps.callbackUrl,
    metadata: { order_number: p.order_number },
  }));
  if (!res.ok || !res.data?.authorization_url) return { status: 502, body: { error: 'paystack_unavailable' } };

  if (body.issue_link) {
    const l = await deps.userRpc('set_quote_payment_link', { p_quote_id: body.quote_id, p_link: res.data.authorization_url });
    if (l.error) return mapError(l.error.message);
  }
  // Buyer-facing: nothing about suppliers.
  return { status: 200, body: { authorization_url: res.data.authorization_url, reference: p.reference, order_number: p.order_number, amount_cents: p.amount_cents } };
}

function mapError(message: string) {
  const code = Object.keys(KNOWN).find((k) => message.includes(k));
  if (code) return { status: KNOWN[code], body: { error: code } };
  if (/not found/i.test(message)) return { status: 404, body: { error: 'not_found' } };
  if (/admin only|sign in|42501/i.test(message)) return { status: 403, body: { error: 'forbidden' } };
  return { status: 400, body: { error: 'request_failed' } };
}
