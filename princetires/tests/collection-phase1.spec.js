// @ts-check
/**
 * Collection page Phase 1 acceptance tests.
 * Run against live princetires.ca after the snippet is pushed.
 *
 * Run: npx playwright test tests/collection-phase1.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test('1. Trailer service-type filter shows (ST) symbol, not (C)', async ({ page }) => {
  await page.goto(COLLECTION);
  const trailerRow = page.locator('a[data-filter-key="filter.p.m.custom.service_type"][data-filter-value="ST"]');
  await expect(trailerRow).toBeVisible();
  await expect(trailerRow).toContainText('(ST)');
  await expect(trailerRow).not.toContainText('(C)');
});

test('2. Collection page renders pagination controls when there are >24 products', async ({ page }) => {
  await page.goto(COLLECTION);
  // Pagination is rendered by the existing paginate block. Check for either Next button or page numbers.
  const paginationArea = page.locator('.ptg__page-btn, [class*="ptg__page"]').first();
  // Tires collection has 1000+ products, so pagination MUST appear.
  await expect(paginationArea).toBeAttached();
});

test('3. Vendor filter list is sourced from collection.filters (counts visible, full coverage)', async ({ page }) => {
  await page.goto(COLLECTION);
  const vendorLinks = page.locator('a[data-filter-key="filter.p.vendor"]');
  const count = await vendorLinks.count();
  // Should be at least 20 vendors when sourced from the full collection
  expect(count).toBeGreaterThanOrEqual(20);
  // First vendor should have a count badge with parentheses (e.g., "(47)")
  const firstCount = await vendorLinks.first().locator('.ptg__filter-cnt').textContent();
  expect(firstCount).toMatch(/\(\d+\)/);
});

test('4. Rim-pill click preserves other active filters', async ({ page }) => {
  // Land on collection with an active vendor + season filter
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin&filter.p.m.custom.seasonality=Winter');
  // Capture the URL the page navigates to after we click a rim pill
  const navTargets = [];
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) navTargets.push(frame.url());
  });
  // Open the Rim diameter accordion if needed
  const rimDetails = page.locator('details:has(.ptg__filter-pill)');
  if (await rimDetails.isVisible()) {
    await rimDetails.evaluate(el => { el.open = true; });
  }
  const rimPill17 = page.locator('a.ptg__filter-pill[data-filter-set-value="17"]').first();
  await rimPill17.click();
  await page.waitForLoadState('domcontentloaded');
  const finalUrl = page.url();
  expect(finalUrl).toContain('filter.p.m.custom.rim_diameter=17');
  expect(finalUrl).toContain('filter.p.vendor=Michelin');
  expect(finalUrl).toContain('filter.p.m.custom.seasonality=Winter');
});

test('5. Results count is visible by default (not display:none)', async ({ page }) => {
  await page.goto(COLLECTION);
  const resultsRow = page.locator('[data-ptg-result-count]');
  await expect(resultsRow).toBeVisible();
  // Should contain "Showing N tires" text
  await expect(resultsRow).toContainText(/Showing \d+ tires/i);
});

test('6. Sort dropdown includes the new "Newest" option', async ({ page }) => {
  await page.goto(COLLECTION);
  const sortSelect = page.locator('#ptg-sort');
  await expect(sortSelect).toBeAttached();
  const newestOption = sortSelect.locator('option[value="created-descending"]');
  await expect(newestOption).toBeAttached();
  await expect(newestOption).toHaveText(/Newest/i);
});

test('7. Out-of-stock products get the unavailable class + OOS overlay', async ({ page }) => {
  // Land with availability=0 filter so we render only OOS products
  await page.goto(COLLECTION + '?filter.v.availability=0');
  await page.waitForLoadState('domcontentloaded');
  const oosCards = page.locator('.ptg__card--unavailable');
  const oosCount = await oosCards.count();
  // If there are any OOS products in the collection, they should have the class
  if (oosCount > 0) {
    const overlay = oosCards.first().locator('.ptg__card-oos');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveText(/out of stock/i);
  } else {
    test.skip(true, 'No out-of-stock products in collection to test against');
  }
});
