import { expect, test } from '@playwright/test';
import { USERS, backendWith, uiLogin } from '../helpers/mockBackend';

test.describe('auth and role routing (mocked backend)', () => {
  test('wrong password shows the error and stays on /login', async ({ page }) => {
    await backendWith('buyer').install(page);
    await uiLogin(page, { email: USERS.buyer.email, password: 'nope' });
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  for (const [who, path] of [['buyer', '/orders'], ['admin', '/admin'], ['supplier', '/supplier/jobs'], ['driver', '/driver/trips']] as const) {
    test(`${who} lands on ${path}`, async ({ page }) => {
      await backendWith(who).install(page);
      await uiLogin(page, USERS[who]);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    });
  }

  test('pending account is sent to /pending and cannot open its dashboard', async ({ page }) => {
    await backendWith('pending').install(page);
    await uiLogin(page, USERS.pending);
    await expect(page).toHaveURL(/\/pending$/);
    await page.goto('/supplier/jobs');
    await expect(page).toHaveURL(/\/pending$/);
  });

  test('suspended account is told so and signed out', async ({ page }) => {
    await backendWith('suspended').install(page);
    await uiLogin(page, USERS.suspended);
    await expect(page.getByText(/account has been suspended/i)).toBeVisible();
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signed-out visitors are bounced to /login from every private area', async ({ page }) => {
    await backendWith().install(page);
    for (const p of ['/orders', '/orders/new', '/admin', '/admin/users', '/supplier/jobs', '/driver/trips', '/profile']) {
      await page.goto(p);
      await expect(page, p).toHaveURL(/\/login$/);
    }
  });

  test('a buyer cannot open admin, supplier or driver areas', async ({ page }) => {
    await backendWith('buyer').install(page);
    await uiLogin(page, USERS.buyer);
    await expect(page).toHaveURL(/\/orders$/);
    for (const p of ['/admin', '/admin/orders', '/supplier/jobs', '/driver/trips']) {
      await page.goto(p);
      await expect(page, p).toHaveURL(/\/orders$/);
    }
  });

  test('an admin cannot sit in the buyer area', async ({ page }) => {
    await backendWith('admin').install(page);
    await uiLogin(page, USERS.admin);
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('forgot password without an email asks for one', async ({ page }) => {
    await backendWith().install(page);
    await page.goto('/login');
    await page.getByRole('button', { name: /forgot password/i }).click();
    await expect(page.getByText(/enter your email above first/i)).toBeVisible();
  });

  test('unknown URL shows the not-found page', async ({ page }) => {
    await backendWith().install(page);
    await page.goto('/definitely/not/a/page');
    await expect(page.getByRole('heading')).toContainText(/not found|404|lost/i);
  });

  test('the session survives a reload', async ({ page }) => {
    await backendWith('buyer').install(page);
    await uiLogin(page, USERS.buyer);
    await expect(page).toHaveURL(/\/orders$/);
    await page.reload();
    await expect(page).toHaveURL(/\/orders$/);
  });
});
