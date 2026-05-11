// @ts-check
/**
 * Verify: typing a vehicle that doesn't match on the homepage smart-search
 * fires the missing-vehicle webhook (auto-capture to Google Sheet).
 *
 * Run: npx playwright test tests/homepage-no-match-webhook.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const TEST_QUERY = `E2E TEST ${new Date().toISOString()} — 2000 Honda Civic`;

test('homepage smart-search no-match fires the missing-vehicle webhook', async ({ page }) => {
  const webhookCalls = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('script.google.com/macros/s/') && u.includes('/exec')) {
      webhookCalls.push({ url: u, method: req.method(), body: req.postData() });
    }
  });

  await page.goto('https://princetires.ca/');

  // Find the smart-search input
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });

  // Type the query and press Enter to submit
  await input.fill(TEST_QUERY);
  await input.press('Enter');

  // Wait for the fallback ("We couldn't find a match") to render
  await page.locator('.hero-smart-search__fallback-title').waitFor({ state: 'visible', timeout: 15000 });

  // Give the webhook fetch a moment to fire
  await page.waitForTimeout(1500);

  console.log('Webhook calls observed:', webhookCalls.length);
  webhookCalls.forEach(c => console.log(`  ${c.method} ${c.url}\n    body: ${(c.body || '').slice(0, 300)}`));

  expect(webhookCalls.length, 'webhook should be POSTed at least once').toBeGreaterThan(0);
  expect(webhookCalls[0].method).toBe('POST');
  expect(webhookCalls[0].body).toContain(TEST_QUERY);

  console.log(`\n✓ Test query "${TEST_QUERY}" sent. Check the Google Sheet for this row.`);
});
