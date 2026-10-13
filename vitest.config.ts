import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Unit + component tests (jsdom). Playwright specs (*.spec.ts) and the RLS suite (node:test,
// *.test.mjs) are deliberately NOT picked up here.
// API tests run through vitest.api.config.ts (node environment, real Postgres).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      include: [
        'src/**/*.test.{ts,tsx}',
        'tests/e2e/helpers/**/*.test.ts',
        'tests/api/_fixtures/**/*.test.ts',
      ],
      css: false,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      },
    },
  }),
);
