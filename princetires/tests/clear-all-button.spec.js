// @ts-check
/**
 * Clear-all button acceptance tests.
 *
 * The sidebar chip bar has a 'Clear all' button at the end. Expected:
 *   - With size + brand + season → clear all should keep size, drop brand + season
 *   - With ONLY brand + season → clear all should land on bare /collections/tires
 *   - After clearing, the sessionStorage marker should already be set, so
 *     auto-default doesn't re-seed the seasons
 *
 * Run: npx playwright test tests/clear-all-button.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test('1. Clear all button is visible when filters are active', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin&filter.p.m.custom.seasonality=Winter');
  const clearBtn = page.locator('[data-active-filters-sidebar] [data-clear-all]');
  await expect(clearBtn).toBeVisible();
  await expect(clearBtn).toHaveText(/Clear all/i);
});

test('2. Clear all drops brand + season — preserves tire size when all 3 are present', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=225&filter.p.m.custom.tire_profile=45&filter.p.m.custom.rim_diameter=17&filter.p.vendor=Michelin&filter.p.m.custom.seasonality=Winter');

  await Promise.all([
    page.waitForURL(/tire_width=225/, { timeout: 5000 }),
    page.locator('[data-active-filters-sidebar] [data-clear-all]').click()
  ]);

  const url = page.url();
  // Size is preserved
  expect(url).toContain('filter.p.m.custom.tire_width=225');
  expect(url).toContain('filter.p.m.custom.tire_profile=45');
  expect(url).toContain('filter.p.m.custom.rim_diameter=17');
  // Brand + season are dropped
  expect(url).not.toContain('filter.p.vendor');
  expect(url).not.toContain('seasonality');
});

test('3. Clear all with NO tire size lands on bare /collections/tires (no auto-default re-seeding)', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin&filter.p.m.custom.seasonality=Winter');

  await Promise.all([
    page.waitForURL(url => url.pathname === '/collections/tires' && !url.search.includes('seasonality'), { timeout: 5000 }),
    page.locator('[data-active-filters-sidebar] [data-clear-all]').click()
  ]);

  const url = page.url();
  // Should land on bare collection URL — no seasonality, no vendor, no filters at all
  expect(url).toMatch(/\/collections\/tires(\?.*)?$/);
  expect(url).not.toContain('seasonality');
  expect(url).not.toContain('filter.p.vendor');
});

test('4. Empty-state Clear-all button works the same way', async ({ page }) => {
  // Use an impossible filter combination to force the empty state
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=999&filter.p.m.custom.tire_profile=30&filter.p.m.custom.rim_diameter=26&filter.p.vendor=Michelin');
  const emptyClearBtn = page.locator('[data-clear-all-empty]');
  await expect(emptyClearBtn).toBeVisible();
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    emptyClearBtn.click()
  ]);
  const url = page.url();
  // After clear-all-empty, all filters should be dropped (size + vendor)
  expect(url).not.toContain('tire_width=999');
  expect(url).not.toContain('filter.p.vendor');
});
