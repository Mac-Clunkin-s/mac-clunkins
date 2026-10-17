import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL points the suite at an already-running deployment (staging, a Vercel/Hostinger
// preview). When unset, Playwright starts `npm run dev` itself.
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    // Escape hatch for sandboxes whose preinstalled Chromium differs from this Playwright's pin.
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Africa/Johannesburg',
    locale: 'en-ZA',
  },
  projects: [
    // Buyers, suppliers and drivers are on phones; admins are on desktops. Run both everywhere.
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: external
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
          VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? 'ci-placeholder-anon-key',
        },
      },
});
