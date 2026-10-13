# Edge Functions

| Function | Caller | Auth | Purpose |
| --- | --- | --- | --- |
| `paystack-webhook` | Paystack | HMAC-SHA512 `x-paystack-signature` (deploy with `--no-verify-jwt`) | Verifies, de-duplicates and applies `charge.success`, `transfer.success`, `transfer.failed`, `transfer.reversed`, `refund.processed`, `charge.dispute.create`. The only thing that can mark an order paid. |
| `paystack-init` | Buyer app, admin console | Caller's Supabase JWT | `{quote_id, issue_link?}` -> accepts the quote, starts a payment attempt, returns the Paystack checkout URL. |
| `paystack-transfer` | pg_cron / admin tool | `Authorization: Bearer <service role key>` | `{action:'process_queue'}` sends queued supplier/driver payouts; `{action:'refund', refund_id}` starts a refund. |

All decisions live in `_shared/*.ts` (pure, dependency-injected, tested from node by `tests/api`). The `index.ts` files only read the environment and wire `fetch` and supabase-js in.

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | all three | `sk_test_...` until live approval. Set with `supabase secrets set`; never committed. |
| `SUPABASE_URL` | all three | Provided by the platform. |
| `SUPABASE_SERVICE_ROLE_KEY` | webhook, transfer | Provided by the platform. Server only. |
| `SUPABASE_ANON_KEY` | init | Provided by the platform. |
| `PAYSTACK_CALLBACK_URL` | init | Optional. Where Paystack sends the buyer after checkout. |
| `ALLOWED_ORIGIN` | init | Optional CORS origin (default `*`; set to the app origin in production). |

## Deploy

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx PAYSTACK_CALLBACK_URL=https://app.example/orders
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy paystack-init
supabase functions deploy paystack-transfer --no-verify-jwt   # gated by the service-role bearer check inside
```

Then in the Paystack dashboard set the webhook URL to
`https://<project-ref>.supabase.co/functions/v1/paystack-webhook`.

## Scheduling payouts

The database queues transfers; something must call `paystack-transfer`. With `pg_cron` + `pg_net`:

```sql
select cron.schedule('mc-send-payouts', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/paystack-transfer',
    headers := jsonb_build_object('Authorization', 'Bearer ' || '<service-role-key from vault>', 'Content-Type', 'application/json'),
    body := '{"action":"process_queue"}'::jsonb)
$$);
```

Keep the key in Supabase Vault, not in the cron command text.

## Local tests

`node --test tests/api/webhook.test.mjs` needs no database or network (Node 22.18+ strips the TypeScript types itself).
