// @ts-check
/**
 * Collection page Phase 2 acceptance tests.
 * Run against live princetires.ca after the snippet is pushed.
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

async function expandDetails(page) {
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(d => { d.open = true; });
  });
}

test('1. Season filter is a vertical list (not icons), with all 4 options', async ({ page }) => {
  await page.goto(COLLECTION);
  await expandDetails(page);
  const items = ['Summer', 'All-Season', 'All-Weather', 'Winter'];
  for (const v of items) {
    const row = page.locator(`a[data-filter-key="filter.p.m.custom.seasonality"][data-filter-value="${v}"]`);
    await expect(row).toBeAttached();
  }
  // The OLD icon picker should be gone
  await expect(page.locator('.ptg__season-icon')).toHaveCount(0);
});

test('2. Brand filter has a search input that hides non-matching items', async ({ page }) => {
  await page.goto(COLLECTION);
  await expandDetails(page);
  const search = page.locator('[data-brand-search]');
  await expect(search).toBeAttached();
  await search.fill('michel');
  // Michelin should remain visible
  await expect(page.locator('a[data-filter-key="filter.p.vendor"][data-filter-value="Michelin"]')).toBeVisible();
  // Bridgestone should be hidden (style.display='none')
  const bridgestone = page.locator('a[data-filter-key="filter.p.vendor"][data-filter-value="Bridgestone"]');
  const display = await bridgestone.evaluate(el => getComputedStyle(el).display);
  expect(display).toBe('none');
});

test('3. Active filter chips render with human labels + Clear all', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=225&filter.p.m.custom.tire_profile=45&filter.p.m.custom.rim_diameter=17&filter.p.vendor=Michelin&filter.p.m.custom.seasonality=Winter');
  const bar = page.locator('[data-active-filters-sidebar]');
  await expect(bar).toBeVisible();
  // Check for human-friendly labels
  await expect(bar).toContainText('Winter');
  await expect(bar).toContainText('Michelin');
  await expect(bar).toContainText('Rim: 17');
  await expect(bar).toContainText('Width: 225');
  await expect(bar).toContainText('Aspect: 45');
  await expect(bar.locator('[data-clear-all]')).toBeVisible();
});

test('4. Persistent header shows tire size context', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=225&filter.p.m.custom.tire_profile=45&filter.p.m.custom.rim_diameter=17');
  const sizeContext = page.locator('[data-results-size]');
  await expect(sizeContext).toBeVisible();
  await expect(sizeContext).toContainText('225/45R17');
});

test('5. Width filter pills exist and link to tire_width param', async ({ page }) => {
  await page.goto(COLLECTION);
  await expandDetails(page);
  const widthPill = page.locator('a.ptg__filter-pill[data-filter-set-key="filter.p.m.custom.tire_width"][data-filter-set-value="225"]');
  await expect(widthPill).toBeAttached();
});

test('6. Aspect ratio pills exist and link to tire_profile param', async ({ page }) => {
  await page.goto(COLLECTION);
  await expandDetails(page);
  const aspectPill = page.locator('a.ptg__filter-pill[data-filter-set-key="filter.p.m.custom.tire_profile"][data-filter-set-value="45"]');
  await expect(aspectPill).toBeAttached();
});

test('7. Empty state surfaces missing-vehicle form + Clear-all button', async ({ page }) => {
  // Use an impossible filter combination to force the empty state
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=999&filter.p.m.custom.tire_profile=30&filter.p.m.custom.rim_diameter=26');
  const empty = page.locator('.ptg__empty');
  await expect(empty).toBeVisible();
  await expect(empty.locator('[data-clear-all-empty]')).toBeVisible();
  await expect(empty.locator('[data-empty-missing-form]')).toBeVisible();
});

test('8. Mobile filter button is fixed-position with count badge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 13 mini
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin&filter.p.m.custom.seasonality=Winter');
  const btn = page.locator('[data-open-filters]');
  await expect(btn).toBeVisible();
  const position = await btn.evaluate(el => getComputedStyle(el).position);
  expect(position).toBe('fixed');
  // Count badge should reflect 2 active filters
  const count = await btn.getAttribute('data-count');
  expect(parseInt(count, 10)).toBeGreaterThanOrEqual(2);
});
