import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './helpers/accounts';
import { loginViaUi } from './helpers/auth';
import { SKIP_REASON, hasLiveBackend } from './helpers/env';
import { ROUTES } from './helpers/routes';

test.describe('buyer journey', () => {
  test.skip(!hasLiveBackend(), SKIP_REASON);

  test('buyer logs in and lands on their own orders', async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.buyer);
    await expect(page).toHaveURL(new RegExp(`${ROUTES.buyerOrders}$`));
  });

  test('buyer cannot open another role dashboard', async ({ page }) => {
    await loginViaUi(page, ACCOUNTS.buyer);
    await page.goto(ROUTES.adminDashboard);
    await expect(page).not.toHaveURL(new RegExp(`${ROUTES.adminDashboard}$`));
  });

  test.fixme(
    'buyer gets a quote, ticks the terms checkbox and reaches the pay page',
    // Quote and pay screens are on the buyer feature branch (planned: /orders/new, /orders/:id/pay).
    // Un-fix once merged: pick bird type + qty, drop a pin, see the quote with ETA, confirm
    // "Pay" is disabled until the terms checkbox is ticked, then expect the Paystack hand-off.
    async ({ page }) => {
      await loginViaUi(page, ACCOUNTS.buyer);
      await page.goto(ROUTES.buyerNewOrder);
      await page.getByRole('button', { name: /get (a )?quote/i }).click();
      const pay = page.getByRole('button', { name: /^pay/i });
      await expect(pay).toBeDisabled();
      await page.getByRole('checkbox', { name: /terms/i }).check();
      await expect(pay).toBeEnabled();
    },
  );

  test.fixme('buyer sees delivery ETA and status after paying', async () => {
    // Blocked on the payments webhook (backend branch) and the order-tracking screen.
  });
});
