// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  SEED_USERS,
  asSeedUser,
  connect,
  connectionConfig,
  hasDatabase,
  uniqueReference,
  withRollback,
  type PgClientLike,
} from './seed';

describe('seed constants', () => {
  it('uses seven distinct, well-formed v4-style uuids', () => {
    const ids = Object.values(SEED_USERS);
    expect(new Set(ids).size).toBe(7);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('uniqueReference', () => {
  it('never repeats', () => {
    const refs = new Set(Array.from({ length: 500 }, () => uniqueReference()));
    expect(refs.size).toBe(500);
  });

  it('uses the prefix', () => {
    expect(uniqueReference('pay')).toMatch(/^pay_/);
  });
});

describe('hasDatabase / connectionConfig', () => {
  it('detects PGHOST or DATABASE_URL', () => {
    expect(hasDatabase({})).toBe(false);
    expect(hasDatabase({ PGHOST: 'localhost' })).toBe(true);
    expect(hasDatabase({ DATABASE_URL: 'postgres://x' })).toBe(true);
  });

  it('prefers DATABASE_URL, else PG* with defaults', () => {
    expect(connectionConfig({ DATABASE_URL: 'postgres://x' })).toEqual({ connectionString: 'postgres://x' });
    expect(connectionConfig({ PGHOST: 'h' })).toMatchObject({ host: 'h', port: 5432, user: 'postgres', database: 'postgres' });
  });
});

describe('transaction helpers (recorded statements)', () => {
  const recorder = () => {
    const sql: string[] = [];
    const client: PgClientLike = {
      query: async (text: string) => {
        sql.push(text.trim());
        return { rows: [] };
      },
      end: async () => undefined,
    };
    return { client, sql };
  };

  it('withRollback always rolls back, even when the body throws', async () => {
    const { client, sql } = recorder();
    await expect(withRollback(client, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(sql).toEqual(['begin', 'rollback']);
  });

  it('asSeedUser sets claims and role, and resets the role', async () => {
    const { client, sql } = recorder();
    await asSeedUser(client, 'buyer', async () => 1);
    expect(sql).toEqual(['select set_config($1, $2, true)', 'set local role authenticated', 'reset role']);
  });

  it('asSeedUser(null) runs as anon', async () => {
    const { client, sql } = recorder();
    await asSeedUser(client, null, async () => 1);
    expect(sql).toContain('set local role anon');
  });
});

// Only runs where a database exists (CI "database" job, or after `npm run db:up` with PGHOST set).
describe.skipIf(!hasDatabase())('against a real database', () => {
  it('connects and sees the schema', async () => {
    const client = await connect();
    try {
      const rows = await withRollback(client, async () => (await client.query('select count(*)::int as n from public.profiles')).rows);
      expect(typeof (rows[0] as { n: number }).n).toBe('number');
    } finally {
      await client.end();
    }
  });
});
