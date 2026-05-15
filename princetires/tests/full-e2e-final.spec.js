// @ts-check
/**
 * Final end-to-end: verifies the full live pipeline on princetires.ca.
 *   1. GTM fires
 *   2. Missing-vehicle form on the live storefront POSTs to the webhook
 *      (Google Sheet receives a row + email goes out)
 */

const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';
const TEST_VEHICLE = `E2E FINAL TEST ${new Date().toISOString()} — 2019 Mazda CX-5`;

test('A. GTM script loads on the live site', async ({ page }) => {
  const gtmRequests = [];
  page.on('request', req => {
    if (req.url().includes('googletagmanager.com/gtm.js')) gtmRequests.push(req.url());
  });

  const res = await page.goto(BASE);
  expect(res.status()).toBe(200);

  // Give GTM a beat to fire
  await page.waitForTimeout(2000);

  const gtmReq = gtmRequests.find(u => u.includes('GTM-KZ2D39VQ'));
  expect(gtmReq, 'gtm.js should load with id=GTM-KZ2D39VQ').toBeTruthy();
  console.log('GTM request:', gtmReq);
});

test('B. Live storefront submits the missing-vehicle form to the webhook', async ({ page }) => {
  // Watch for the POST to Google Apps Script
  const webhookCalls = [];
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('script.google.com/macros/s/') && u.includes('/exec')) {
      webhookCalls.push({ url: u, status: res.status() });
    }
  });

  await page.goto(`${BASE}/pages/booking`);

  // Click "I'm buying tires" to reveal the search widget
  await page.locator('[data-bp-path="buy"]').click();
  await page.locator('#bp-buy').waitFor({ state: 'visible' });

  // Switch to vehicle tab
  await page.locator('[data-pt-ts-tab="vehicle"]').click();

  // Open missing-vehicle form
  await page.locator('[data-pt-ts-missing-toggle]').click();
  await page.locator('[data-pt-ts-missing-body]').waitFor({ state: 'visible' });

  // Type a test vehicle + click Send
  await page.locator('[data-pt-ts-missing-input]').fill(TEST_VEHICLE);
  await page.locator('[data-pt-ts-missing-send]').click();

  // Wait for success status. The handler posts to the webhook, awaits the response,
  // then sets status.textContent = "Thanks — we'll add it."
  const status = page.locator('[data-pt-ts-missing-status]');
  await expect(status).toHaveText(/Thanks/i, { timeout: 15000 });

  // Confirm the webhook was actually called
  expect(webhookCalls.length, 'Form should POST to the webhook URL').toBeGreaterThan(0);
  console.log('Webhook calls observed:', webhookCalls);
  console.log(`Sent test vehicle: "${TEST_VEHICLE}" — check the Google Sheet for this row`);

  // Take a screenshot of the success state
  await page.screenshot({ path: 'test-results/final-e2e-success.png', fullPage: false });
});
