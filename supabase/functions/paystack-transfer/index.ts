// POST /paystack-transfer {action: 'process_queue' | 'refund', limit?, refund_id?}
// Server-to-server only: requires `Authorization: Bearer <SERVICE_ROLE_KEY>` (pg_cron via
// pg_net, or an admin tool holding the service key). Deploy with `--no-verify-jwt` and let
// the check below be the gate, or keep JWT verification on and call it with the service key.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PAYSTACK_API, safeEqual } from '../_shared/paystack.ts';
import { processTransferQueue, startRefund } from '../_shared/transfers.ts';

const secret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!serviceKey || !secret || !safeEqual(bearer, serviceKey)) return new Response('unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const deps = {
    rpc: (fn: string, args: Record<string, unknown>) => db.rpc(fn, args) as any,
    paystackPost: async (path: string, payload: unknown) => {
      const r = await fetch(`${PAYSTACK_API}${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok && !!j.status, message: j.message, data: j.data };
    },
  };
  try {
    const out = body.action === 'refund' ? await startRefund(deps, body.refund_id) : await processTransferQueue(deps, body.limit ?? 20);
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'failed' }), { status: 500 });
  }
});
