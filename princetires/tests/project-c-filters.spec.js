// @ts-check
/**
 * Project C — Tire-type filter + in-stock toggle acceptance.
 * Tests against live princetires.ca.
 *
 * Run: npx playwright test tests/project-c-filters.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';
const PAGE = '/pages/booking';

async function openWidget(page) {
  await page.goto(`${BASE}${PAGE}`);
  await page.locator('[data-bp-path="buy"]').click();
  await page.locator('#bp-buy').waitFor({ state: 'visible' });
}

test('1. Segmented control renders with 4 season buttons + in-stock checkbox', async ({ page }) => {
  await openWidget(page);
  await expect(page.locator('[data-pt-ts-season=""]')).toBeVisible();
  await expect(page.locator('[data-pt-ts-season="Summer"]')).toBeVisible();
  await expect(page.locator('[data-pt-ts-season="Winter"]')).toBeVisible();
  await expect(page.locator('[data-pt-ts-season="All-Season"]')).toBeVisible();
  await expect(page.locator('[data-pt-ts-instock]')).toBeVisible();
});

test('2. Clicking Winter activates it + persists to localStorage', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);

  const winterBtn = page.locator('[data-pt-ts-season="Winter"]');
  await winterBtn.click();
  await expect(winterBtn).toHaveClass(/pt-ts__season--active/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pt-tire-search-filters') || '{}'));
  expect(stored.season).toBe('Winter');
  expect(stored.inStock).toBe(true);
});

test('3. In-stock toggle defaults checked + persists when unchecked', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);

  const checkbox = page.locator('[data-pt-ts-instock]');
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pt-tire-search-filters') || '{}'));
  expect(stored.inStock).toBe(false);
});

test('4. buildCollectionUrl includes season + availability params on submit', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);

  await page.locator('[data-pt-ts-season="Winter"]').click();
  await page.locator('[data-pt-ts-width]').selectOption('225');
  await page.locator('[data-pt-ts-aspect]').selectOption('45');
  await page.locator('[data-pt-ts-rim]').selectOption('17');

  await page.route('**/collections/tires*', route => route.fulfill({ status: 200, body: 'ok' }));
  let target = '';
  page.on('request', req => { if (req.url().includes('/collections/tires')) target = req.url(); });

  await page.locator('[data-pt-ts-submit-size]').click();
  await page.waitForTimeout(500);

  expect(target).toContain('filter.p.m.custom.tire_width=225');
  expect(target).toContain('filter.p.m.custom.tire_profile=45');
  expect(target).toContain('filter.p.m.custom.rim_diameter=17');
  expect(target).toContain('filter.p.m.custom.seasonality=Winter');
  expect(target).toContain('filter.v.availability=1');
});

test('5. "All-season" UI option appends BOTH All-Season and All-Weather metafield values', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);

  await page.locator('[data-pt-ts-season="All-Season"]').click();
  await page.locator('[data-pt-ts-width]').selectOption('225');
  await page.locator('[data-pt-ts-aspect]').selectOption('45');
  await page.locator('[data-pt-ts-rim]').selectOption('17');

  await page.route('**/collections/tires*', route => route.fulfill({ status: 200, body: 'ok' }));
  let target = '';
  page.on('request', req => { if (req.url().includes('/collections/tires')) target = req.url(); });

  await page.locator('[data-pt-ts-submit-size]').click();
  await page.waitForTimeout(500);

  expect(target).toContain('filter.p.m.custom.seasonality=All-Season');
  expect(target).toContain('filter.p.m.custom.seasonality=All-Weather');
});

test('6. Any season + in-stock OFF produces a URL with neither filter', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);

  await page.locator('[data-pt-ts-season=""]').click();
  await page.locator('[data-pt-ts-instock]').uncheck();
  await page.locator('[data-pt-ts-width]').selectOption('225');
  await page.locator('[data-pt-ts-aspect]').selectOption('45');
  await page.locator('[data-pt-ts-rim]').selectOption('17');

  await page.route('**/collections/tires*', route => route.fulfill({ status: 200, body: 'ok' }));
  let target = '';
  page.on('request', req => { if (req.url().includes('/collections/tires')) target = req.url(); });

  await page.locator('[data-pt-ts-submit-size]').click();
  await page.waitForTimeout(500);

  expect(target).not.toContain('seasonality');
  expect(target).not.toContain('filter.v.availability');
});
