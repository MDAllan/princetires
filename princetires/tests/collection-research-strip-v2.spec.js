// @ts-check
/**
 * Re-search strip v2 tests — saved-cars quick-pick + Clear buttons +
 * mobile horizontal 3-up size dropdowns.
 *
 * Run: npx playwright test tests/collection-research-strip-v2.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test.beforeEach(async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('pt-garage-')).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('pt-tire-search-vehicle');
  });
});

test('1. Vehicle tab shows saved cars as quick-pick chips', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-garage-test', JSON.stringify([
      { year: 2020, make: 'Honda', model: 'Civic', trim: 'LX', tireSize: '215/55R16', isDefault: true }
    ]));
  });
  await page.reload();
  await page.locator('[data-pt-rs-tab="vehicle"]').click();
  await expect(page.locator('[data-pt-rs-saved]')).toBeVisible();
  const chips = page.locator('[data-pt-rs-saved-list] .pt-rs__saved-chip');
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toContainText('2020 Honda Civic');
});

test('2. Clicking a saved-car chip applies the size as filter', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-garage-test', JSON.stringify([
      { year: 2020, make: 'Honda', model: 'Civic', trim: 'LX', tireSize: '215/55R16', isDefault: true }
    ]));
  });
  await page.reload();
  await page.locator('[data-pt-rs-tab="vehicle"]').click();
  await Promise.all([
    page.waitForURL(/tire_width=215/, { timeout: 5000 }),
    page.locator('[data-pt-rs-saved-list] .pt-rs__saved-chip').first().click()
  ]);
  const url = page.url();
  expect(url).toContain('filter.p.m.custom.tire_width=215');
  expect(url).toContain('filter.p.m.custom.tire_profile=55');
  expect(url).toContain('filter.p.m.custom.rim_diameter=16');
  expect(url).toContain('filter.p.vendor=Michelin');
});

test('3. Size Clear button shows when any of W/A/R is filled, then resets the dropdowns', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=225&filter.p.m.custom.tire_profile=45&filter.p.m.custom.rim_diameter=17');
  // Pre-filled from URL → Clear visible
  await expect(page.locator('[data-pt-rs-clear-size]')).toBeVisible();
  await page.locator('[data-pt-rs-clear-size]').click();
  await expect(page.locator('[data-pt-rs-width]')).toHaveValue('');
  await expect(page.locator('[data-pt-rs-aspect]')).toHaveValue('');
  await expect(page.locator('[data-pt-rs-rim]')).toHaveValue('');
  // Clear hides itself
  await expect(page.locator('[data-pt-rs-clear-size]')).toBeHidden();
});

test('4. Vehicle Clear button shows after year pick, resets cascade', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.locator('[data-pt-rs-tab="vehicle"]').click();
  await expect(page.locator('[data-pt-rs-clear-vehicle]')).toBeHidden();
  await page.locator('[data-pt-rs-year]').selectOption('2020');
  await expect(page.locator('[data-pt-rs-clear-vehicle]')).toBeVisible();
  await page.locator('[data-pt-rs-clear-vehicle]').click();
  await expect(page.locator('[data-pt-rs-year]')).toHaveValue('');
  await expect(page.locator('[data-pt-rs-make]')).toBeDisabled();
});

test('5. Mobile: 3 size dropdowns sit in one row (≤768px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  // Strip is collapsed on mobile; tap "Change search" first
  await page.locator('[data-pt-rs-toggle]').click();

  const width = page.locator('[data-pt-rs-width]');
  const aspect = page.locator('[data-pt-rs-aspect]');
  const rim = page.locator('[data-pt-rs-rim]');
  const wBox = await width.boundingBox();
  const aBox = await aspect.boundingBox();
  const rBox = await rim.boundingBox();
  // All three should share a row — within a few pixels of the same y
  expect(Math.abs(wBox.y - aBox.y)).toBeLessThan(8);
  expect(Math.abs(aBox.y - rBox.y)).toBeLessThan(8);
});

test('6. Collection text indicator surfaces tire-size + saved car', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=215&filter.p.m.custom.tire_profile=55&filter.p.m.custom.rim_diameter=16');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX', tireSize: '215/55R16'
    }));
  });
  await page.reload();
  const ctx = page.locator('[data-ptg-context]');
  await expect(ctx).toBeVisible();
  await expect(ctx).toContainText('215/55R16');
  await expect(ctx).toContainText('Honda Civic');
});
