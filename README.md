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
| -------------------------- | ------------------------------------------------- |
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
