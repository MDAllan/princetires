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

test('1. Segmented control renders with 3 season buttons + clear link + in-stock checkbox', async ({ page }) => {
  await openWidget(page);
  await expect(page.locator('[data-pt-ts-season="Summer"]')).toBeVisible();
  await expect(page.locator('[data-pt-ts-season="Winter"]')).toBeVisible();
  await expect(page.locator('[data-pt-ts-season="All-Season"]')).toBeVisible();
  // Old "Any season" button is gone
  await expect(page.locator('[data-pt-ts-season=""]')).toHaveCount(0);
  // Clear link exists in DOM but hidden until a season is selected
  await expect(page.locator('[data-pt-ts-season-clear]')).toBeAttached();
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
  expect(stored.seasons).toEqual(['Winter']);
  expect(stored.inStock).toBe(true);
});

test('2b. Multi-select: clicking Winter + All-Season activates both, stored as array', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);

  await page.locator('[data-pt-ts-season="Winter"]').click();
  await page.locator('[data-pt-ts-season="All-Season"]').click();

  await expect(page.locator('[data-pt-ts-season="Winter"]')).toHaveClass(/pt-ts__season--active/);
  await expect(page.locator('[data-pt-ts-season="All-Season"]')).toHaveClass(/pt-ts__season--active/);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pt-tire-search-filters') || '{}'));
  expect(stored.seasons).toEqual(['Winter', 'All-Season']);
});

test('2c. "× Clear" link wipes all selected seasons + hides itself', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);

  const clearBtn = page.locator('[data-pt-ts-season-clear]');
  // Hidden when nothing selected
  await expect(clearBtn).toBeHidden();

  await page.locator('[data-pt-ts-season="Winter"]').click();
  await page.locator('[data-pt-ts-season="Summer"]').click();
  // Visible now that 2 seasons are selected
  await expect(clearBtn).toBeVisible();

  await clearBtn.click();
  await expect(page.locator('[data-pt-ts-season="Winter"]')).not.toHaveClass(/pt-ts__season--active/);
  await expect(page.locator('[data-pt-ts-season="Summer"]')).not.toHaveClass(/pt-ts__season--active/);
  await expect(clearBtn).toBeHidden();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pt-tire-search-filters') || '{}'));
  expect(stored.seasons).toEqual([]);
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

test('5. "All-season" UI option emits BOTH All-Season AND All-Weather metafield values', async ({ page }) => {
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

test('5b. Old localStorage shape (season as string) is migrated to seasons array', async ({ page }) => {
  await page.goto(BASE);
  // Inject the OLD shape with a single-string season
  await page.evaluate(() => localStorage.setItem('pt-tire-search-filters', JSON.stringify({
    season: 'Winter',
    inStock: true,
    savedAt: '2026-01-01T00:00:00.000Z'
  })));
  await openWidget(page);

  // Winter should be activated from the migrated value
  await expect(page.locator('[data-pt-ts-season="Winter"]')).toHaveClass(/pt-ts__season--active/);

  // The stored value should now be the new shape after readFilterPrefs migrated it
  // (writeFilterPrefs only writes on user interaction, so trigger one)
  await page.locator('[data-pt-ts-season="Summer"]').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pt-tire-search-filters') || '{}'));
  expect(Array.isArray(stored.seasons)).toBe(true);
  expect(stored.seasons).toContain('Winter');
  expect(stored.seasons).toContain('Summer');
  expect(stored.season).toBeUndefined();
});

test('6. No season selected + in-stock OFF produces a URL with neither filter', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);

  // No season clicks — default state is empty
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
