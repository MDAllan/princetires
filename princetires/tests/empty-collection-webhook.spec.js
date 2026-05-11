// @ts-check
/**
 * Verify: landing on /collections/tires with tire-size filters that match
 * zero products fires the missing-vehicle webhook.
 */
const { test, expect } = require('@playwright/test');

test('empty tire-size collection page POSTs to missing-vehicle webhook', async ({ page }) => {
  const webhookCalls = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('script.google.com/macros/s/') && u.includes('/exec')) {
      webhookCalls.push({ method: req.method(), body: req.postData() });
    }
  });

  // Use a size that almost certainly has zero inventory: 999/30R26
  await page.goto('https://princetires.ca/collections/tires?filter.p.m.custom.tire_width=999&filter.p.m.custom.tire_profile=30&filter.p.m.custom.rim_diameter=26');

  // Wait for the empty state OR for the products grid
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000); // let the inline script fire

  console.log('Webhook calls observed:', webhookCalls.length);
  webhookCalls.forEach(c => console.log(`  ${c.method}  body=${(c.body || '').slice(0, 250)}`));

  expect(webhookCalls.length, 'webhook should fire on empty collection').toBeGreaterThan(0);
  expect(webhookCalls[0].body).toContain('OUT OF STOCK');
  expect(webhookCalls[0].body).toContain('999/30R26');
});
