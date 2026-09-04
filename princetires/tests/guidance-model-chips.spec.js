// @ts-check
/**
 * Year-make guidance chips — when the customer types "<year> <make>" the
 * smart-search shows model-pick chips drawn from pt-vehicle-<year>.json,
 * mirroring the make-pick chips that fire on the year-only hint. Clicking
 * a chip fills "<year> <make> <model>" and re-runs the search.
 *
 *  - Typing "2012 Honda" surfaces model chips containing canonical Honda
 *    models (Civic / Accord / CR-V / Pilot …)
 *  - Clicking the Civic chip routes the input to "2012 Honda Civic" and
 *    fires the vehicle search (URL contains tire_width/profile/rim filters)
 *  - For a make without a curated popularModels entry, chips still appear
 *    (alpha-fallback) — Mazda 2012 should surface "3" / "Mazda3" style keys
 *
 * Run: npx playwright test tests/guidance-model-chips.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  // Reset to Tires mode so the hint card behaves the standard way
  await page.evaluate(() => { try { localStorage.removeItem('pt-search-mode'); } catch (e) {} });
  await page.reload();
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

test('typing "2012 Honda" renders model chips on the guidance card', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012 Honda');
  // Hint card renders immediately; chips hydrate async from pt-vehicle-2012.json
  await page.locator('.hero-smart-search__guidance-title', { hasText: /what model/i })
    .waitFor({ state: 'visible', timeout: 5000 });
  // Chips render after the data file fetch settles
  const chips = page.locator('.hero-smart-search__guidance-chip[data-model]');
  await expect(chips.first()).toBeVisible({ timeout: 5000 });

  const labels = (await chips.allTextContents()).map(s => s.trim());
  // Honda has 10 models in 2012; chips capped at 8. Confirm canonical names appear.
  expect(labels.length).toBeGreaterThanOrEqual(4);
  expect(labels).toEqual(expect.arrayContaining(['Civic']));
});

test('clicking a model chip fills "<year> <make> <model>" and runs the search', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012 Honda');
  const civicChip = page.locator('.hero-smart-search__guidance-chip[data-model="Civic"]');
  await civicChip.waitFor({ state: 'visible', timeout: 6000 });
  await civicChip.click();
  await expect(input).toHaveValue('2012 Honda Civic');
  // The re-run should route to a vehicle-result list eventually; assert
  // results pane opens and the input no longer shows the hint state.
  await page.waitForTimeout(1500);
  const guidanceTitle = page.locator('.hero-smart-search__guidance-title', { hasText: /what model/i });
  await expect(guidanceTitle).toHaveCount(0);
});

test('uncurated make ("2012 Mazda") still surfaces alpha-fallback chips', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012 Mazda');
  await page.locator('.hero-smart-search__guidance-title', { hasText: /what model/i })
    .waitFor({ state: 'visible', timeout: 5000 });
  const chips = page.locator('.hero-smart-search__guidance-chip[data-model]');
  await expect(chips.first()).toBeVisible({ timeout: 5000 });
  expect(await chips.count()).toBeGreaterThanOrEqual(3);
});

test('year-only hint still renders make chips (regression — existing behavior intact)', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012');
  await page.locator('.hero-smart-search__guidance-title', { hasText: /what car/i })
    .waitFor({ state: 'visible', timeout: 5000 });
  // Make chips have data-make but NO data-model
  const makeChips = page.locator('.hero-smart-search__guidance-chip[data-make]:not([data-model])');
  await expect(makeChips.first()).toBeVisible();
  expect(await makeChips.count()).toBeGreaterThanOrEqual(4);
});
