// POST /paystack-init {quote_id, issue_link?} with the caller's Supabase JWT.
// Buyer: accepts their own quote and gets a Paystack checkout URL.
// Admin (issue_link: true): same for a requested quote on the buyer's behalf, and the
// URL is stored on the quote as the payment link (valid until the quote's expiry).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PAYSTACK_API } from '../_shared/paystack.ts';
import { handleInit } from '../_shared/init.ts';

const secret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const cors = {
  'access-control-allow-origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'access-control-allow-headers': 'authorization, content-type, apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  const auth = req.headers.get('Authorization');
  if (!auth || !secret) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: auth ? 500 : 401, headers: cors });

  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const body = await req.json().catch(() => ({}));
  const result = await handleInit(
    {
      userRpc: (fn, args) => user.rpc(fn, args) as any,
      callbackUrl: Deno.env.get('PAYSTACK_CALLBACK_URL') ?? undefined,
      paystackPost: async (path, payload) => {
        const r = await fetch(`${PAYSTACK_API}${path}`, {
          method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok && !!j.status, message: j.message, data: j.data };
      },
    },
    body,
  );
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { ...cors, 'content-type': 'application/json' } });
});
