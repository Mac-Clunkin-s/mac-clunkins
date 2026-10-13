# Backend API: pricing, matching, quotes, payments, payouts

Migrations (apply in this order, after the existing ones):

1. `20261012000100_pricing_engine.sql` — settings keys, `quotes.breakdown`, `stock_reservations`, pricing/matching/quote/order functions, scheduled-job functions.
2. `20261012000200_payments_payouts.sql` — `webhook_events`, transfer queue columns + unique indexes, payment/payout/refund functions, `pg_cron` schedules (only if the extension exists).

Everything money-related is integer cents. Rates are read from `public.settings` at call time and snapshotted into `quotes.breakdown.settings`, so a settings change affects new quotes only.

## Flow

```
buyer            create_instant_quote ──► instant (<=200 birds, <=300 km, matched) ── held 30 min, stock reserved
                      │                └► requested (otherwise) ──► admin_price_quote ── valid 24 h
                 accept_quote_create_order ──► order `placed`  (stock stays held, unpaid cancel at 24 h)
                 start_payment ──► reference ──► paystack-init ──► Paystack checkout
Paystack         charge.success ─► paystack-webhook: signature ► idempotency ► re-verify ► mark_order_paid
                      └► order `paid`, allocations + trips created, stock committed, delivery code issued
admin            admin_assign_driver
driver           driver_confirm_pickup ──► supplier transfer queued   (order `on_the_way`)
                 driver_confirm_delivery(code) ──► driver transfer queued (order `delivered`)
paystack-transfer claim_transfers ► POST /transfer ► mark_transfer_sent;  webhook transfer.success/failed ► mark_transfer_result
                 failed ─ retry_failed_transfers (backoff) ─ after payout_max_attempts ─ export_bank_file (CSV)
all paid         order `settled`
```

## Functions

| Function | Who can execute | Notes |
| --- | --- | --- |
| `calculate_quote_breakdown(jsonb)`, `calculate_price_breakdown(price, birds, km)` | service_role | Half-up rounding; one delivery fee per allocation (vehicle), one service fee overall. |
| `estimate_margin(total, supplier, driver, transfers=2)` | service_role | What McCluckin's keeps after Paystack costs. |
| `match_suppliers(...)`, `plan_allocations(...)` | service_role (and other definer functions) | Never callable by buyers: they return supplier ids and prices. |
| `create_instant_quote`, `request_quote`, `reprice_quote` | active buyer | Return buyer-safe JSON only (no supplier id/price/distance). |
| `accept_quote_create_order`, `start_payment` | owning buyer, or admin on the buyer's behalf | Refuses expired/unpriced quotes (`quote_expired`, `quote_not_priced`). |
| `admin_price_quote`, `admin_match_preview`, `set_quote_payment_link`, `admin_assign_driver`, `admin_queue_refund`, `export_bank_file` | admin (checked inside) | |
| `driver_confirm_pickup`, `driver_confirm_delivery` | the assigned active driver | These are what queue payouts. |
| `mark_order_paid`, `record_webhook_event`, `finish_webhook_event`, `claim_transfers`, `mark_transfer_*`, `retry_failed_transfers`, `begin_refund`, `complete_refund_request`, `apply_refund_processed`, `record_dispute` | service_role only | `mark_order_paid` is the only way an order becomes paid. |
| `expire_quotes`, `cancel_unpaid_orders`, `flag_expiring_documents`, `generate_pdma_report` | service_role / pg_cron | |

Every function is `security definer` only where it must read data the caller cannot (suppliers, settings, documents), with `search_path = ''`, fully qualified names, and `revoke all ... from public, anon, authenticated` followed by an explicit grant list.

## Rules as built

- **Price** per bird = supplier price + max(markup % of price, min margin). **Delivery** = base + km x per-km + birds x per-bird. **Service fee** = service_fee_pct % of (birds + delivery). **Driver share** = driver_share_pct % of delivery. All half-up.
- **Matching**: eligible suppliers only (active profile, not paused, avian-flu `none` or `surveillance` with an approved unexpired `movement_permit`, every kind in setting `supplier_required_docs` approved and unexpired, active price, free stock >= its minimum order, at least one eligible driver vehicle). Ranked: same province, nearest, most free stock, lowest landed price, best rating. Free stock = this week's `stock.birds_available` minus unexpired held reservations.
- **Split**: the plan walks the ranking, takes what each supplier can give, and cuts each share into chunks no larger than the largest eligible vehicle (`driver_details.capacity_birds`, covered if the supplier requires it). One chunk = one allocation = one trip = one delivery fee.
- **Routing**: instant when `quantity <= rfq_min_birds`, `max km <= rfq_max_km` and the plan fills the order; otherwise a `requested` quote for admin to price.
- **Privacy**: buyer RPCs return `quote_id, kind, status, bird_type, weight_band, quantity, bird_price_cents, delivery_fee_cents, service_fee_cents, total_cents, expires_at`. `quotes.breakdown` is outside the column grant. `order_events` are buyer-visible so they hold neutral status notes only; payout detail goes to `audit_log` (admin-only).
- **Audit**: quote created/priced/expired, order created/paid/cancelled, payment started/mismatch/dispute, payout queued/sent/failed/success/retry, refunds, document pauses, PDMA generation all write `audit_log`; status changes also write `order_events`.

## Settings used

Existing: `markup_pct, min_margin_cents, service_fee_pct, delivery_base_cents, delivery_per_km_cents, delivery_per_bird_cents, driver_share_pct, quote_hold_minutes, rfq_min_birds, rfq_max_km, min_order, unpaid_cancel_hours`.
Added by migration 1 (`on conflict do nothing`): `rfq_quote_hours` (24), `doc_expiry_warn_days` (30), `road_distance_factor` (1), `supplier_required_docs` (`["pdma","supplier_agreement"]`), `driver_required_docs` (`[]`), `paystack_card_pct` (2.9), `paystack_card_flat_cents` (100), `paystack_vat_pct` (15), `paystack_transfer_fee_cents` (300), `payout_max_attempts` (5), `payout_retry_minutes` (15).

## Assumptions to confirm

- **McCluckin's keeps R632.38 on #MC-1053** is reproduced exactly (63 238 c) with: card fee = (2.9% x total charged + R1) x 1.15 VAT = 16 740 c; two transfers at R3 + 15% VAT = 690 c; margin = total - supplier - driver - card fee - transfer fees. The service fee is not netted separately: it is part of the total the card fee is charged on.
- **Distance** is PostGIS straight-line km x `road_distance_factor` (default 1, i.e. no road uplift). Raise the factor (e.g. 1.25) if straight-line under-bills delivery.
- **Split pricing**: `quotes.bird_price_cents` for a multi-supplier order is the weighted average per bird; `total_cents` is the exact sum of the per-allocation lines.
- **Required documents** default to PDMA + supplier agreement. A supplier with neither approved is not matched, so the seeded demo supplier needs two approved `documents` rows (or set `supplier_required_docs` to `[]`) before instant quotes work.
- **Same province wins before distance**; cross-border trips need a state-vet movement permit, which is why a farther same-province supplier is preferred.
- Webhook idempotency key is `event:object-id` because Paystack events carry no event id of their own.
- Bank details are stored encrypted and not decrypted in SQL; the bank-file CSV lists recipient name, amount and order number for the finance admin to pay from the secure vault.
- Removal/movement-permit enforcement at pickup is not part of this change.

## Tests

```bash
npm run db:up                       # applies all migrations + seed locally
node --test tests/api/*.test.mjs    # pricing, matching, payments, webhook
```

`pricing`, `matching` and `payments` need the local database (same connection settings as `tests/rls`); `webhook.test.mjs` is database-free. Each DB test builds its own world inside a transaction and rolls back, so it does not depend on the seed.
