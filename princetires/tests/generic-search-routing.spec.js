// @ts-check
/**
 * Generic search routing: verify that category-style queries
 * ("trailer tires", "13 inch", etc.) route to filtered collection
 * URLs instead of falling into the "no match" fallback.
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

async function searchAndCapture(page, query) {
  const targets = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/collections/tires')) targets.push(u);
  });
  await page.route('**/collections/tires*', route => route.fulfill({ status: 200, body: 'blocked' }));

  await page.goto(BASE);
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill(query);
  await input.press('Enter');
  await page.waitForTimeout(1500);
  return targets;
}

test('1. "trailer tires" routes to service_type=ST', async ({ page }) => {
  const targets = await searchAndCapture(page, 'trailer tires');
  expect(targets.length, 'should redirect to collection').toBeGreaterThan(0);
  expect(targets[0]).toContain('filter.p.m.custom.service_type=ST');
});

test('2. "truck tires" routes to service_type=LT', async ({ page }) => {
  const targets = await searchAndCapture(page, 'truck tires');
  expect(targets.length).toBeGreaterThan(0);
  expect(targets[0]).toContain('filter.p.m.custom.service_type=LT');
});

test('3. "passenger tires" routes to service_type=P', async ({ page }) => {
  const targets = await searchAndCapture(page, 'passenger tires');
  expect(targets.length).toBeGreaterThan(0);
  expect(targets[0]).toContain('filter.p.m.custom.service_type=P');
});

test('4. "13 inch tires" routes to rim_diameter=13', async ({ page }) => {
  const targets = await searchAndCapture(page, '13 inch tires');
  expect(targets.length).toBeGreaterThan(0);
  expect(targets[0]).toContain('filter.p.m.custom.rim_diameter=13');
});

test('5. "13 inch trailer tires" combines BOTH filters', async ({ page }) => {
  const targets = await searchAndCapture(page, '13 inch trailer tires');
  expect(targets.length).toBeGreaterThan(0);
  expect(targets[0]).toContain('filter.p.m.custom.service_type=ST');
  expect(targets[0]).toContain('filter.p.m.custom.rim_diameter=13');
});

test('6. "Michelin winter tires" still works (brand + season)', async ({ page }) => {
  const targets = await searchAndCapture(page, 'Michelin winter tires');
  expect(targets.length).toBeGreaterThan(0);
  expect(targets[0]).toContain('filter.p.vendor=Michelin');
  expect(targets[0]).toContain('filter.p.m.custom.seasonality=Winter');
});

test('7. "22 inch tires" routes to rim_diameter=22', async ({ page }) => {
  const targets = await searchAndCapture(page, '22 inch tires');
  expect(targets.length).toBeGreaterThan(0);
  expect(targets[0]).toContain('filter.p.m.custom.rim_diameter=22');
});
