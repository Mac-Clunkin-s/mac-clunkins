import { createHmac, timingSafeEqual } from 'node:crypto';

/** Paystack signs the exact raw request body with HMAC-SHA512 and sends it in this header. */
export const PAYSTACK_SIGNATURE_HEADER = 'x-paystack-signature';

/** Hex HMAC-SHA512 of `rawBody` keyed with the Paystack secret key. Sign the raw string, not a re-serialisation. */
export function signPaystackPayload(rawBody: string | Buffer, secret: string): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

/** Constant-time check, mirroring what a webhook handler must do. False for any malformed signature. */
export function verifyPaystackSignature(rawBody: string | Buffer, signature: string | undefined | null, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = Buffer.from(signPaystackPayload(rawBody, secret), 'hex');
  const given = Buffer.from(signature, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
