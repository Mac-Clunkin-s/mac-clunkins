import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './helpers/accounts';
import { loginViaUi } from './helpers/auth';
import { SKIP_REASON, hasLiveBackend } from './helpers/env';
import { ROUTES } from './helpers/routes';

test.describe('driver journey', () => {
  test.skip(!hasLiveBackend(), SKIP_REASON);

  test('an approved driver lands on their trips', async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.driver);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.driverTrips}$`));
  });

  test('a driver awaiting approval is held on /pending', async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.pendingDriver);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.pending}$`));
  });

  test.fixme('driver runs a trip: pickup, in transit, delivered with a count', async () => {
    // Blocked on the trip lifecycle screens (supplier+driver feature branch).
  });
});
