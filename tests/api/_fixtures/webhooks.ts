import { PAYSTACK_SIGNATURE_HEADER, signPaystackPayload } from './paystack';

// Fake Paystack webhook bodies for tests. Shapes follow Paystack's documented event envelope
// ({ event, data }) with the fields our handlers read; they are test doubles, not a recording of
// real traffic. Amounts are integer cents (ZAR minor units) — the same unit Paystack uses.

export type PaystackEventName =
  | 'charge.success'
  | 'transfer.success'
  | 'transfer.failed'
  | 'refund.processed'
  | 'charge.dispute.create';

export interface PaystackEvent<D = Record<string, unknown>> {
  event: PaystackEventName;
  data: D;
}

const DEFAULT_PAID_AT = '2026-10-13T08:00:00.000Z';
const CURRENCY = 'ZAR';

let sequence = 1_000_000;
/** Unique, increasing numeric id like Paystack's. */
export const nextId = (): number => ++sequence;

export interface ChargeSuccessInput {
  reference: string;
  amountCents: number;
  id?: number;
  email?: string;
  paidAt?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export function chargeSuccess(input: ChargeSuccessInput): PaystackEvent {
  return {
    event: 'charge.success',
    data: {
      id: input.id ?? nextId(),
      status: 'success',
      reference: input.reference,
      amount: input.amountCents,
      currency: CURRENCY,
      channel: input.channel ?? 'card',
      paid_at: input.paidAt ?? DEFAULT_PAID_AT,
      gateway_response: 'Successful',
      customer: { email: input.email ?? 'buyer@mccluckins.test' },
      metadata: input.metadata ?? {},
    },
  };
}

export interface TransferInput {
  reference: string;
  amountCents: number;
  transferCode?: string;
  id?: number;
  reason?: string;
}

export function transferSuccess(input: TransferInput): PaystackEvent {
  return {
    event: 'transfer.success',
    data: {
      id: input.id ?? nextId(),
      status: 'success',
      reference: input.reference,
      transfer_code: input.transferCode ?? `TRF_${input.reference}`,
      amount: input.amountCents,
      currency: CURRENCY,
      reason: input.reason ?? 'McCluckin’s payout',
      transferred_at: DEFAULT_PAID_AT,
    },
  };
}

export function transferFailed(input: TransferInput): PaystackEvent {
  return {
    event: 'transfer.failed',
    data: {
      id: input.id ?? nextId(),
      status: 'failed',
      reference: input.reference,
      transfer_code: input.transferCode ?? `TRF_${input.reference}`,
      amount: input.amountCents,
      currency: CURRENCY,
      reason: input.reason ?? 'Transfer failed',
    },
  };
}

export interface RefundProcessedInput {
  /** Reference of the original charge being refunded. */
  transactionReference: string;
  amountCents: number;
  refundReference?: string;
  id?: number;
}

export function refundProcessed(input: RefundProcessedInput): PaystackEvent {
  return {
    event: 'refund.processed',
    data: {
      id: input.id ?? nextId(),
      status: 'processed',
      transaction_reference: input.transactionReference,
      refund_reference: input.refundReference ?? `RFD_${input.transactionReference}`,
      amount: input.amountCents,
      currency: CURRENCY,
      processed_at: DEFAULT_PAID_AT,
    },
  };
}

export interface DisputeInput {
  transactionReference: string;
  amountCents: number;
  id?: number;
  reason?: string;
}

export function chargeDisputeCreate(input: DisputeInput): PaystackEvent {
  return {
    event: 'charge.dispute.create',
    data: {
      id: input.id ?? nextId(),
      status: 'awaiting-merchant-response',
      refund_amount: input.amountCents,
      currency: CURRENCY,
      category: 'chargeback',
      reason: input.reason ?? 'Goods not received',
      created_at: DEFAULT_PAID_AT,
      transaction: {
        reference: input.transactionReference,
        amount: input.amountCents,
        currency: CURRENCY,
      },
    },
  };
}

export interface SignedWebhook {
  /** The exact string to send as the request body. */
  body: string;
  headers: Record<string, string>;
  signature: string;
}

/** Serialise once, sign that exact string, and return it ready to POST to the webhook endpoint. */
export function signedWebhook(event: PaystackEvent, secret: string): SignedWebhook {
  const body = JSON.stringify(event);
  const signature = signPaystackPayload(body, secret);
  return {
    body,
    signature,
    headers: { 'content-type': 'application/json', [PAYSTACK_SIGNATURE_HEADER]: signature },
  };
}
