import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './helpers/accounts';
import { loginViaUi } from './helpers/auth';
import { SKIP_REASON, hasLiveBackend } from './helpers/env';
import { ROUTES } from './helpers/routes';

test.describe('supplier journey', () => {
  test.skip(!hasLiveBackend(), SKIP_REASON);

  test('a supplier awaiting approval is held on /pending', async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.pendingSupplier);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.pending}$`));
    await expect(page.getByRole('heading', { name: 'Awaiting approval' })).toBeVisible();
    await page.goto(ROUTES.supplierJobs);
    await expect(page).not.toHaveURL(new RegExp(`${ROUTES.supplierJobs}$`));
  });

  test('an approved supplier lands on their jobs', async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.supplier);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.supplierJobs}$`));
  });

  test.fixme('supplier accepts a job, sets the ready time and marks stock ready', async () => {
    // Blocked on the supplier job screens (supplier+driver feature branch).
  });
});
