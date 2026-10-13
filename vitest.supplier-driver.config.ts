// Run with: npx vitest run --config vitest.supplier-driver.config.ts
// Needs devDependencies: vitest, jsdom, @testing-library/react (see PR description).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/pages/{supplier,driver,supplier-driver-shared}/__tests__/**/*.test.{ts,tsx}'],
  },
});
