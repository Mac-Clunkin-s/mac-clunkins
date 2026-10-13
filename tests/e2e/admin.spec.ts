import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './helpers/accounts';
import { createTestUser, deleteTestUser, loginViaUi } from './helpers/auth';
import { SKIP_REASON, hasLiveBackend, serviceRoleKey } from './helpers/env';
import { ROUTES } from './helpers/routes';

test.describe('admin journey', () => {
  test.skip(!hasLiveBackend(), SKIP_REASON);

  test('admin sees the dashboard and the users list', async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.admin);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.adminDashboard}$`));
    await page.goto(ROUTES.adminUsers);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.adminUsers}$`));
  });

  test.fixme(
    'admin approves a pending supplier and that supplier can then reach /supplier/jobs',
    // Needs the approval control on /admin/users (admin feature branch). Creates its own
    // pending supplier so the seeded one stays pending for the supplier spec.
    async ({ page, browser }) => {
      test.skip(!serviceRoleKey(), 'needs E2E_SUPABASE_SERVICE_ROLE_KEY to create a pending supplier');
      const supplier = await createTestUser('supplier', 'Pending Supplier');
      try {
        await loginViaUi(page, ACCOUNTS.admin);
        await page.goto(ROUTES.adminUsers);
        const row = page.getByRole('row', { name: new RegExp(supplier.email) });
        await row.getByRole('button', { name: /approve/i }).click();
        await expect(row).toContainText(/active|approved/i);

        const supplierPage = await (await browser.newContext()).newPage();
        await loginViaUi(supplierPage, supplier);
        await expect(supplierPage).toHaveURL(new RegExp(`${ROUTES.supplierJobs}$`));
      } finally {
        await deleteTestUser(supplier.id);
      }
    },
  );

  test('a non-admin is turned away from /admin/users', async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.buyer);
    await page.goto(ROUTES.adminUsers);
    await expect(page).not.toHaveURL(new RegExp(`${ROUTES.adminUsers}$`));
  });
});
