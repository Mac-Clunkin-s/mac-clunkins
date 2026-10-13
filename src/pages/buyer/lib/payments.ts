import { supabase } from '../../../lib/supabase';
import type { PaymentChannel } from '../types';

// NOTE: the brief names src/lib/payments.ts. It does not exist on main and src/lib is shared, so this
// lives beside the buyer pages. Move it to src/lib/payments.ts when convenient (no API change).

/** Shown to the buyer as what Paystack's hosted page will offer. The init contract only takes a quote id. */
export const PAYMENT_METHODS: PaymentChannel[] = ['card', 'eft', 'capitec_pay', 'qr'];

export class PaymentInitError extends Error {}

/** Asks the `paystack-init` Edge Function for a hosted checkout URL. Never marks anything paid:
 *  payment state is written by the Paystack webhook on the server and only ever READ here. */
export async function startCheckout(quoteId: string): Promise<{ authorizationUrl: string }> {
  const { data, error } = await supabase.functions.invoke('paystack-init', { body: { quote_id: quoteId } });
  if (error) throw new PaymentInitError(error.message);
  const url = (data as { authorization_url?: string } | null)?.authorization_url;
  if (!url) throw new PaymentInitError('missing authorization_url');
  return { authorizationUrl: url };
}

export function redirectToCheckout(url: string): void {
  window.location.assign(url);
}
