# McCluckin's

Live-chicken ordering marketplace for South Africa. Buyers order, McCluckin's admins source
from suppliers and schedule a driver, and the database enforces the one rule the whole design
follows: **buyers, suppliers and drivers never see each other's identities, prices or contact
details.**

Stack: React 18 + TypeScript + Vite + Tailwind + React Router, Supabase (Postgres + PostGIS,
Auth, Storage, Edge Functions, row-level security). Money is stored in cents; currency ZAR;
timezone Africa/Johannesburg.

This is Phase 1 (Foundations) of the roadmap: the database schema, RLS policies, and the auth +
role-dashboard shell of the app. Ordering, fulfilment and payments are later phases.

## Repo layout

```
supabase/migrations/   SQL migrations — extensions, enums, tables, helpers, RLS, views, signup
supabase/seed.sql      Seed data: reference tables, settings, and one test account per role
supabase/local/        Docker-less local Postgres bootstrap (auth schema shim, role grants)
scripts/local-db.sh              Runs a real Postgres 17 + PostGIS cluster without Docker
scripts/paperclip-cost-report.mjs  Org-level agent spend report (see below) — not app code
tests/rls/             RLS privacy test suite — exercises real Postgres roles, not the UI
src/                   The Vite/React app
```

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL 17 with the PostGIS extension, for the local RLS test stack (see below)
- A Supabase project (cloud, or `supabase start` if you have Docker) to run the actual app
  against — the local Postgres stack is for running migrations and the RLS suite only; it does
  not run Supabase Auth or PostgREST, so the frontend cannot talk to it directly

## 1. Install dependencies

```bash
npm install
```

## 2. Run the database layer

Two options, in order of preference:

**A. Supabase CLI (if you have Docker):**

```bash
supabase start
supabase db reset   # applies supabase/migrations/*.sql, then supabase/seed.sql
```

This gives you a real Supabase stack (Postgres, Auth, PostgREST, Storage) on localhost — copy
the printed API URL and anon key into `.env` (see step 3).

**B. Docker-less local Postgres (for migrations + the RLS suite only, no Auth/PostgREST):**

```bash
npm run db:up      # initialises and starts Postgres 17 + PostGIS, applies migrations + seed
npm run test:rls   # runs the RLS privacy suite against it
npm run db:psql    # opens a psql shell against it
npm run db:reset   # wipes and reapplies everything from scratch
npm run db:down    # stops it
```

`scripts/local-db.sh` requires `psql`/`initdb`/`pg_ctl` from PostgreSQL 17 on `PATH` (default
`/usr/lib/postgresql/17/bin`, override with `PGBIN`). It layers a small Supabase-compatible
shim (`supabase/local/00_supabase_bootstrap.sql`) on top of vanilla Postgres — an `auth` schema,
`auth.uid()`, and the `anon` / `authenticated` / `service_role` roles — so the exact same
migrations and RLS policies run as they would on Supabase. It does **not** run GoTrue or
PostgREST, so signing in through the browser needs a real Supabase project (option A).

## 3. Configure the frontend

```bash
cp .env.example .env
```

Fill in from your Supabase project's Settings → API:

| Variable                  | Where it comes from                              |
| ----------------------------- | ---------------------------------------------- |
| `VITE_SUPABASE_URL`        | Project Settings → API → Project URL              |
| `VITE_SUPABASE_ANON_KEY`   | Project Settings → API → anon / public key         |

Never commit `.env`. Only the anon key belongs in the frontend — the service-role key never
does.

## 4. Run the app

```bash
npm run dev        # dev server, http://localhost:5173
npm run build       # production build to dist/
npm run typecheck   # tsc project references, no emit
npm run lint         # eslint
```

## Test accounts (seeded)

Seeded by `supabase/seed.sql`. Password reveals the account's role.

| Role              | Email                             | Password              | Status  |
| ----------------- | ---------------------------------- | ---------------------- | ------- |
| Admin             | admin@mccluckins.test              | `McCluckins!Admin1`    | active  |
| Buyer             | buyer@mccluckins.test              | `McCluckins!Buyer1`    | active  |
| Buyer (2nd)       | buyer2@mccluckins.test             | `McCluckins!Buyer2`    | active  |
| Supplier          | supplier@mccluckins.test           | `McCluckins!Supp1`     | active  |
| Driver            | driver@mccluckins.test             | `McCluckins!Driver1`   | active  |
| Supplier (pending)| pending-supplier@mccluckins.test   | `McCluckins!Supp2`     | pending |
| Driver (pending)  | pending-driver@mccluckins.test     | `McCluckins!Driver2`   | pending |

Logging in as each active role lands on that role's own dashboard
(`/orders`, `/supplier/jobs`, `/driver/trips`, `/admin`); the two pending accounts land on
`/pending` until an admin approves them. These only work against a real Supabase Auth backend
(option A above) — the Docker-less local Postgres stack has the seeded rows but no running Auth
service to sign in against.

## What's built (Phase 1 scope)

- Full schema: 26 tables, enums, helper functions, RLS policies, role-facing and admin-only
  views, the signup trigger and admin-approval function.
- RLS privacy suite (`tests/rls/privacy.test.mjs`): 37 tests / 9 suites, run as real Postgres
  roles with real JWT claims, proving buyers/suppliers/drivers cannot reach each other's
  identities, prices or contact details, and that admins can — only through the gated admin
  views for the columns other roles are never granted.
- Frontend: Welcome, Sign up, Log in, Awaiting approval (the Brief's "Everyone" screens), a PWA
  manifest, and one dashboard shell per role (Buyer/Supplier/Driver read their own
  orders/jobs/trips; Admin reads aggregate counts) — each with loading, empty and error states,
  gated by a `ProtectedRoute` that checks session, approval status and role.
- Design tokens: cream `#F6F1E9`, ink `#1F1A14`, chilli `#A8321F`, mustard `#F2B544`;
  Bricolage Grotesque headings, Figtree body.

## What's not built yet (later phases)

- Placing an order, payment, tracking, fulfilment, payouts, cases, reports, notifications — all
  Phase 2 onward per the roadmap.
- Phone-number login (email + password only for now).
- Live end-to-end browser verification of the auth flow: this sandbox has no Docker, so there is
  no running Supabase Auth/PostgREST to sign in against. The RLS suite verifies the database
  side directly against real Postgres roles; the frontend auth code is wired to the standard
  Supabase JS client and typechecks/builds cleanly, but hasn't been exercised against a live
  Supabase project. Verify this against a real or `supabase start` project before shipping.
- Deployment: hosting is Hostinger via hPanel Git (pulls a branch straight into the document
  root — no `npm install` or `vite build` on the host), not Vercel. Not a Phase 1 concern.

## Paperclip org cost report

`scripts/paperclip-cost-report.mjs` is a company-ops tool, unrelated to the chicken-marketplace
app — it lives here only because this is the durable repo available to the agent. Run
`node scripts/paperclip-cost-report.mjs` inside an agent run (or with `PAPERCLIP_API_URL`,
`PAPERCLIP_API_KEY`, `PAPERCLIP_COMPANY_ID` exported) to print spend by day-window and by agent,
plus failed-run waste, aggregated straight from heartbeat-run `usageJson` (the `costs/*` rollup
endpoints report $0 while `billingType` is `subscription_included`).

## Testing

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm test` | Vitest unit and component tests (jsdom): i18n, the privacy-assertion helper, Paystack/webhook fixtures | nothing |
| `npm run test:rls` | RLS privacy suite against real Postgres roles | `npm run db:up` |
| `npm run test:api` | API and webhook tests in `tests/api` (Node environment, real Postgres via `PG*` env vars) | `npm run db:up` |
| `npm run test:e2e` | Playwright, mobile (Pixel 7) and desktop Chrome | a browser: `npx playwright install chromium` |
| `npm run test:i18n` | Translation coverage per language; fails on keys that English lacks | nothing |
| `npm run test:coverage` | Vitest with v8 coverage | nothing |

**Playwright.** `npm run test:e2e` starts `npm run dev` itself, or set `E2E_BASE_URL` to test a
running deployment. `smoke.spec.ts` runs anywhere. The role journeys (`buyer`, `supplier`,
`driver`, `admin`) and `privacy.spec.ts` need a live Supabase backend with the seed loaded, so they
skip unless `E2E_LIVE_BACKEND=1` and `VITE_SUPABASE_URL` are set (use `supabase start`, never
production). Specs for screens that have not merged yet are `test.fixme` with the reason in the
test; remove the `fixme` when the screen lands. Fixed route paths live in
`tests/e2e/helpers/routes.ts`. The service-role key, used only to create throwaway users, is read
from `E2E_SUPABASE_SERVICE_ROLE_KEY` in the environment and nowhere else.

**Privacy in the browser.** `tests/e2e/helpers/privacy.ts` records the JSON each role's browser
receives and `assertNoForbiddenKeys(response, forbiddenKeys)` fails if a key such as a supplier
name, buyer phone or supplier price appears. Per-role key sets are in `FORBIDDEN_FOR`; add each new
screen's route to `privacy.spec.ts`.

**API fixtures.** `tests/api/_fixtures/` has a seed helper, the Paystack HMAC-SHA512 signature
helper (`signPaystackPayload`, `verifyPaystackSignature`) and builders for the `charge.success`,
`transfer.success`, `transfer.failed`, `refund.processed` and `charge.dispute.create` webhooks
(`signedWebhook` returns the exact body and header to POST). Put actual API tests next to them in
`tests/api/*.test.ts`.

**Translations.** See [`docs/i18n.md`](docs/i18n.md).

## CI/CD

- **CI** (`.github/workflows/ci.yml`, every pull request and push to `main`):
  - `web`: lint, typecheck, i18n coverage check, Vitest, production build.
  - `database`: Postgres 17 + PostGIS service; applies the Supabase shim, every migration in
    filename order (and rejects duplicate or malformed migration timestamps), the seed and role
    grants, then runs the RLS suite and `tests/api`.
  - `e2e`: Playwright on Chromium (mobile and desktop); `test.fixme` specs are skipped, and live-backend
    specs skip without a backend.
- **Migrations** (`.github/workflows/migrate.yml`): a push to `main` that touches
  `supabase/migrations/**` runs `supabase db push --dry-run` and then `supabase db push` against the
  production project, inside the `production-db` GitHub environment. **One-time setup:** in
  Settings > Environments create `production-db`, add required reviewers (this is the manual
  approval), and add the secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and
  `SUPABASE_PROJECT_REF`. Migrations are forwards-only: write them to be safe to apply once.
- **Pull requests** use `.github/pull_request_template.md`: privacy rule, money in cents, migration
  included, tests added, and CTO + board review for anything touching pricing, payments or payouts.
- Dependencies install with `npm install` in CI until `package-lock.json` is regenerated to include
  the test tooling; then switch the workflows to `npm ci`.
