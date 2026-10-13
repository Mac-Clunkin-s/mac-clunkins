import { expect, test } from '@playwright/test';
import { ROUTES } from './helpers/routes';

// Runs everywhere, including CI with no Supabase: these screens render without a session.

test('welcome screen shows the pitch and the three entry points', async ({ page }) => {
  await page.goto(ROUTES.welcome);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Live chickens');
  await expect(page.getByRole('link', { name: 'Order now' })).toHaveAttribute('href', '/signup?role=buyer');
  await expect(page.getByRole('link', { name: 'Supply chickens' })).toHaveAttribute('href', '/signup?role=supplier');
  await expect(page.getByRole('link', { name: 'Drive for us' })).toHaveAttribute('href', '/signup?role=driver');
});

test('login screen renders its form', async ({ page }) => {
  await page.goto(ROUTES.login);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
});

test('legal pages are public', async ({ page }) => {
  for (const path of ['/legal/terms', '/legal/refunds', '/legal/privacy']) {
    const response = await page.goto(path);
    expect(response?.ok(), path).toBe(true);
  }
});
