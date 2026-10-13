import { defineConfig } from 'vitest/config';

// API / webhook / database tests. Node environment, no React plugin. They talk to the real
// Postgres that CI (or `npm run db:up`) provides through the standard PG* environment variables,
// so run files serially to avoid cross-test interference on shared rows.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/api/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
