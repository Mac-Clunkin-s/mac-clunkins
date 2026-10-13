// Pure Paystack helpers: signature check, idempotency key, request bodies, channel map.
// Nothing here reads the environment or the network; callers pass the secret in.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Paystack signs the RAW request body with HMAC-SHA512 using the secret key (hex digest). */
export function computeSignature(rawBody: string, secret: string): string {
  return createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
}

export function verifySignature(rawBody: string, signature: string | null | undefined, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(computeSignature(rawBody, secret), 'utf8');
  const given = Buffer.from(String(signature).trim().toLowerCase(), 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Paystack events carry no top-level event id, so the idempotency key is the event name
 * plus the id of the object it is about (transaction id, transfer code, refund id,
 * dispute id). A top-level `id`, if Paystack ever sends one, wins.
 */
export function eventKey(payload: any): string {
  const data = payload?.data ?? {};
  const ident = payload?.id ?? data.id ?? data.transfer_code ?? data.reference ?? data.transaction_reference;
  if (ident === undefined || ident === null || ident === '') throw new Error('event has no identifiable object');
  return `${payload.event}:${ident}`;
}

export function mapChannel(channel: string | null | undefined): 'card' | 'eft' | 'capitec_pay' | 'qr' | null {
  switch ((channel ?? '').toLowerCase()) {
    case 'card': return 'card';
    case 'bank': case 'eft': case 'bank_transfer': return 'eft';
    case 'capitec_pay': return 'capitec_pay';
    case 'qr': return 'qr';
    default: return null;
  }
}

export const PAYSTACK_API = 'https://api.paystack.co';
export const ZAR = 'ZAR';

export function initializeBody(p: { email: string; amountCents: number; reference: string; callbackUrl?: string; metadata?: unknown }) {
  return {
    email: p.email, amount: p.amountCents, currency: ZAR, reference: p.reference,
    channels: ['card', 'bank', 'eft', 'capitec_pay', 'qr'],
    ...(p.callbackUrl ? { callback_url: p.callbackUrl } : {}),
    metadata: p.metadata ?? {},
  };
}

export function transferBody(p: { amountCents: number; recipientCode: string; reference: string }) {
  // Neutral reason: it can appear on the recipient's statement, so no order or buyer detail.
  return { source: 'balance', amount: p.amountCents, recipient: p.recipientCode, reference: p.reference, currency: ZAR, reason: "McCluckin's payout" };
}

export function refundBody(p: { reference: string; amountCents: number }) {
  return { transaction: p.reference, amount: p.amountCents, currency: ZAR };
}

/** Constant-time string compare for bearer tokens. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
