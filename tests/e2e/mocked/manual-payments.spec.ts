import { expect, test, type Page } from '@playwright/test';
import { USERS, uiLogin } from '../helpers/mockBackend';
import { BANK, ORDER_ID, QUOTE_ID, buyerWorld, doc } from './fixtures';

async function openPay(page: Page) {
  await uiLogin(page, USERS.buyer);
  await page.goto(`/orders/new/pay?quote=${QUOTE_ID}`);
}
const ticks = async (page: Page) => {
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  for (const b of await page.getByRole('checkbox').all()) await b.check();
};

test.describe('buyer: review and place order (manual payments)', () => {
  test('shows Place order, no Paystack, and needs both acceptances', async ({ page }) => {
    await buyerWorld().install(page);
    await openPay(page);
    const place = page.getByRole('button', { name: 'Place order' });
    await expect(place).toBeDisabled();
    await expect(page.getByText(/paystack/i)).toHaveCount(0);
    await page.getByRole('checkbox').first().check();
    await expect(place).toBeDisabled();
    await page.getByRole('checkbox').nth(1).check();
    await expect(place).toBeEnabled();
  });

  test('places the order and lands on the order page with EFT details', async ({ page }) => {
    const m = buyerWorld();
    await m.install(page);
    await openPay(page);
    await ticks(page);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_ID}$`));
    expect(m.rpcCalls.filter((c) => c.name === 'accept_quote_create_order')).toEqual([
      { name: 'accept_quote_create_order', args: { p_quote_id: QUOTE_ID } },
    ]);
    await expect(page.getByTestId('eft-instructions')).toContainText(BANK.account_number);
    await expect(page.getByTestId('eft-instructions')).toContainText(BANK.reference);
    expect(m.fnCalls.filter((f) => f.name === 'paystack-init')).toHaveLength(0);
  });

  test('a double click places exactly one order', async ({ page }) => {
    const m = buyerWorld();
    m.rpcDelayMs.accept_quote_create_order = 600;
    await m.install(page);
    await openPay(page);
    await ticks(page);
    await page.getByRole('button', { name: 'Place order' }).dblclick();
    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_ID}$`));
    expect(m.rpcCalls.filter((c) => c.name === 'accept_quote_create_order')).toHaveLength(1);
  });

  test('a failed placement shows an error, keeps the buyer on the page and allows retry', async ({ page }) => {
    const m = buyerWorld();
    let n = 0;
    m.rpc('accept_quote_create_order', () => (n++ === 0 ? { error: { message: 'quote_expired' } } : { data: { order_id: ORDER_ID } }));
    await m.install(page);
    await openPay(page);
    await ticks(page);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByText(/couldn't place your order/i)).toBeVisible();
    await expect(page).toHaveURL(/orders\/new\/pay/);
    await expect(page.getByRole('button', { name: 'Place order' })).toBeEnabled();
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_ID}$`));
  });

  test('an expired quote cannot be placed', async ({ page }) => {
    await buyerWorld({ quoteOver: { expires_at: new Date(Date.now() - 60_000).toISOString() } }).install(page);
    await openPay(page);
    await expect(page.getByText(/expired/i).first()).toBeVisible();
    await ticks(page);
    await expect(page.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });

  test('an already accepted quote cannot be placed again', async ({ page }) => {
    await buyerWorld({ quoteOver: { status: 'accepted' } }).install(page);
    await openPay(page);
    await ticks(page);
    await expect(page.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });

  test('a missing quote shows an error rather than a blank page', async ({ page }) => {
    await buyerWorld().install(page);
    await uiLogin(page, USERS.buyer);
    await page.goto('/orders/new/pay?quote=00000000-0000-4000-8000-00000000dead');
    await expect(page.getByText(/couldn't load this quote/i)).toBeVisible();
  });

  test('quote PDF is requested from billing-pdf', async ({ page }) => {
    const m = buyerWorld();
    await m.install(page);
    await openPay(page);
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Download quote PDF' }).click();
    await popup;
    expect(m.rpcCalls.map((c) => c.name)).toContain('issue_quote_document');
    expect(m.fnCalls.find((f) => f.name === 'billing-pdf')?.body).toEqual({ id: doc('quote', 7).id });
  });

  test('the Place order button is not available until the payments mode has loaded', async ({ page }) => {
    const m = buyerWorld({ mode: 'paystack' });
    m.tableDelayMs.settings = 4000;
    await m.install(page);
    await openPay(page);
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    // While the setting is in flight the buyer must not be able to place an unpaid order.
    await expect(page.getByRole('button', { name: 'Place order' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /pay with paystack/i })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('buyer: order page (manual payments)', () => {
  test('unpaid order shows EFT details and the invoice', async ({ page }) => {
    const m = buyerWorld({ docs: [doc('invoice', 1)] });
    await m.install(page);
    await uiLogin(page, USERS.buyer);
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.getByTestId('eft-instructions')).toBeVisible();
    await expect(page.getByText('INV-2026-00001')).toBeVisible();
    await expect(page.getByRole('link', { name: /complete payment/i })).toHaveCount(0);
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await popup;
    expect(m.fnCalls.at(-1)).toEqual({ name: 'billing-pdf', body: { id: doc('invoice', 1).id } });
  });

  test('paid order shows invoice and receipt and hides EFT details', async ({ page }) => {
    await buyerWorld({ orderStatus: 'paid', docs: [doc('invoice', 1), doc('receipt', 2)] }).install(page);
    await uiLogin(page, USERS.buyer);
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.getByText('RCT-2026-00002')).toBeVisible();
    await expect(page.getByTestId('eft-instructions')).toHaveCount(0);
  });

  test('a PDF failure shows an error and does not crash the page', async ({ page }) => {
    const m = buyerWorld({ docs: [doc('invoice', 1)] });
    m.fn('billing-pdf', () => ({ status: 500, body: { error: 'boom' } }));
    await m.install(page);
    await uiLogin(page, USERS.buyer);
    await page.goto(`/orders/${ORDER_ID}`);
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await expect(page.getByRole('alert')).toContainText(/couldn't load this document/i);
    await expect(page.getByTestId('eft-instructions')).toBeVisible();
  });

  test('missing bank details still render dashes rather than "null"', async ({ page }) => {
    const m = buyerWorld();
    m.rpc('get_payment_instructions', () => ({ data: { ...BANK, bank_name: '', account_number: null } }));
    await m.install(page);
    await uiLogin(page, USERS.buyer);
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.getByTestId('eft-instructions')).not.toContainText(/null|undefined/);
  });

  test('in Paystack mode the old Complete payment link is back and no EFT block shows', async ({ page }) => {
    await buyerWorld({ mode: 'paystack' }).install(page);
    await uiLogin(page, USERS.buyer);
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.getByRole('link', { name: /complete payment/i })).toBeVisible();
    await expect(page.getByTestId('eft-instructions')).toHaveCount(0);
  });
});
