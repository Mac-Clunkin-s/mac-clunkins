## What and why

<!-- One or two sentences. Link the issue. -->

## Checklist

- [ ] **Privacy rule holds.** Buyers, suppliers and drivers never see each other's identities, prices or contact details, in the UI, in API responses, and in any new view, RPC or edge function. (`tests/rls` and `tests/e2e/privacy.spec.ts` updated if the surface changed.)
- [ ] **Money is in integer cents (ZAR).** No floats, no rand strings in the database or in API payloads; formatting happens at the edge (`src/lib/format.ts`).
- [ ] **Migration included** for every schema, RLS, view or function change, with a unique 14-digit timestamp (`supabase/migrations/YYYYMMDDHHMMSS_name.sql`). Merging to `main` applies it to production after approval, so it must be safe to run once and forwards-only.
- [ ] **Tests added or updated** (unit, RLS, API or Playwright). Any `test.fixme` I removed now passes; any I added has a reason.
- [ ] **Strings are translatable.** User-facing text goes through `t()` with keys in `src/i18n/en.<area>.json`, not hard-coded.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass locally.

### Needs CTO + board review before merge

Tick this and request review if the PR touches **pricing, payments or payouts** (quotes, fees, margins, Paystack, transfers, refunds, disputes, supplier or driver payout amounts).

- [ ] Not applicable
- [ ] Touches pricing / payments / payouts — CTO and board reviewers requested

## Screenshots / notes

<!-- Mobile and desktop for UI changes. Anything the reviewer should run. -->
