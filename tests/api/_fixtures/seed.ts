// Seed helpers for API tests. Talks to the Postgres that CI (or `npm run db:up`) provides through
// the standard PG* variables. Never point it at a real project: nothing here is guarded against
// production, and it must not be — API tests are for disposable databases only.
//
// The ids mirror tests/rls/helpers.mjs, which mirrors supabase/seed.sql. If the seed changes,
// change all three.
import { randomUUID } from 'node:crypto';

export const SEED_USERS = {
  admin: '11111111-1111-4111-8111-111111111111',
  buyer: '22222222-2222-4222-8222-222222222222',
  otherBuyer: '2b2b2b2b-2222-4222-8222-2b2b2b2b2b2b',
  supplier: '33333333-3333-4333-8333-333333333333',
  driver: '44444444-4444-4444-8444-444444444444',
  pendingSupplier: '55555555-5555-4555-8555-555555555555',
  pendingDriver: '66666666-6666-4666-8666-666666666666',
} as const;

export type SeedUser = keyof typeof SEED_USERS;

/** The minimum of node-postgres' Client that these helpers use. */
export interface PgClientLike {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  end(): Promise<void>;
}

/** True when the environment says a database is available. API tests skip when it is not. */
export function hasDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.PGHOST || env.DATABASE_URL);
}

export function connectionConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.DATABASE_URL) return { connectionString: env.DATABASE_URL };
  return {
    host: env.PGHOST,
    port: Number(env.PGPORT ?? 5432),
    user: env.PGUSER ?? 'postgres',
    password: env.PGPASSWORD,
    database: env.PGDATABASE ?? 'postgres',
  };
}

export async function connect(env: NodeJS.ProcessEnv = process.env): Promise<PgClientLike> {
  const { default: pg } = await import('pg');
  const client = new pg.Client(connectionConfig(env));
  await client.connect();
  return client as unknown as PgClientLike;
}

/**
 * Run `fn` inside a transaction that is always rolled back, so tests cannot leak rows into each
 * other. (Webhook handlers under test that open their own connection need real commits — clean up
 * after those explicitly.)
 */
export async function withRollback<T>(client: PgClientLike, fn: () => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

/** Run `fn` as the Postgres role PostgREST would use for `user`, with that user's JWT claims. */
export async function asSeedUser<T>(client: PgClientLike, user: SeedUser | null, fn: () => Promise<T>): Promise<T> {
  const uid = user ? SEED_USERS[user] : null;
  const role = uid ? 'authenticated' : 'anon';
  const claims = uid
    ? { sub: uid, role, aud: 'authenticated' }
    : { role, aud: 'anon' };
  await client.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify(claims)]);
  await client.query(`set local role ${role}`);
  try {
    return await fn();
  } finally {
    await client.query('reset role');
  }
}

let refCounter = 0;
/** Unique Paystack-style reference, safe to reuse across test runs against the same database. */
export function uniqueReference(prefix = 'mcc'): string {
  refCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${refCounter}_${randomUUID().slice(0, 8)}`;
}
