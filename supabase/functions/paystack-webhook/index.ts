// POST /paystack-webhook — deploy with `--no-verify-jwt` (Paystack sends no Supabase JWT;
// the HMAC-SHA512 signature IS the authentication).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PAYSTACK_API } from '../_shared/paystack.ts';
import { handlePaystackWebhook } from '../_shared/webhook.ts';

const secret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!secret) return new Response('not configured', { status: 500 });
  const raw = await req.text(); // the signature is over the exact raw bytes
  const result = await handlePaystackWebhook(
    {
      secret,
      rpc: (fn, args) => db.rpc(fn, args) as any,
      verifyTransaction: async (reference) => {
        const r = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
          headers: { Authorization: `Bearer ${secret}` },
        });
        const j = await r.json();
        if (!r.ok || !j.status) throw new Error(`verify failed: ${j.message ?? r.status}`);
        return { ...j.data, fees: j.data.fees ?? null };
      },
    },
    raw,
    req.headers.get('x-paystack-signature'),
  );
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
});
