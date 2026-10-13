import { test } from '@playwright/test';
import { ACCOUNTS } from './helpers/accounts';
import { loginViaUi } from './helpers/auth';
import { SKIP_REASON, hasLiveBackend } from './helpers/env';
import { FORBIDDEN_FOR, recordNetwork } from './helpers/privacy';
import { ROUTES } from './helpers/routes';

// "Buyers, suppliers and drivers never see each other's identities, prices or contact details",
// checked on the JSON each role's browser actually receives. The RLS suite proves the database;
// this proves nothing on top of it (views, RPCs, edge functions) puts a column back.
// Add each new screen's path to the role's `pages` list when it merges.

test.describe('network privacy per role', () => {
  test.skip(!hasLiveBackend(), SKIP_REASON);

  const cases = [
    { role: 'buyer', account: ACCOUNTS.buyer, pages: [ROUTES.buyerOrders], forbidden: FORBIDDEN_FOR.buyer },
    { role: 'supplier', account: ACCOUNTS.supplier, pages: [ROUTES.supplierJobs], forbidden: FORBIDDEN_FOR.supplier },
    { role: 'driver', account: ACCOUNTS.driver, pages: [ROUTES.driverTrips], forbidden: FORBIDDEN_FOR.driver },
  ] as const;

  for (const { role, account, pages, forbidden } of cases) {
    test(`${role} responses carry no forbidden keys`, async ({ page }) => {
      const network = recordNetwork(page);
      await loginViaUi(page, account);
      for (const path of pages) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
      }
      await network.assertClean(forbidden);
      if (role === 'driver') await network.assertFirstNamesOnly(['buyer_first_name', 'buyer_name']);
      network.stop();
    });
  }
});
