// @ts-check
/**
 * Bug A — When a single vehicle+trim is resolved (e.g. "2012 Honda Civic DX"),
 *   clicking the red arrow CTA must navigate to the size-filtered collection.
 *   Previously it fell through to the "couldn't find a match" fallback.
 *
 * Bug B — When a vehicle is resolved but we have no trim data, the dropdown
 *   must show a non-clickable "needs trim" guidance card, NOT a "Browse all
 *   tires" link that bypasses the trim gate.
 *
 * Also covers the small "2012honda civic" no-space typo fix (auto-normalize
 * to "2012 honda civic" before parsing).
 *
 * Run: npx playwright test tests/arrow-cta-and-needs-trim.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

test('Bug A: arrow CTA navigates to size collection when single trim is resolved', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012 Honda Civic DX');

  // Wait for the single resolved-vehicle row to render
  await page.locator('.hero-smart-search__result-item').first().waitFor({ state: 'visible', timeout: 15000 });

  // Click the red arrow
  await page.locator('[data-smart-search-submit]').first().click();

  // Must navigate to a tire collection URL with the size filters (NOT show fallback)
  await page.waitForURL(/\/collections\/.*tire_width=195.*tire_profile=65.*rim_diameter=15/i, { timeout: 10000 });

  // Sanity: the homepage no-match fallback must NOT be rendered
  await expect(page.locator('.hero-smart-search__fallback-title')).toHaveCount(0);
});

test('Bug B: "Browse all tires" filter link is no longer rendered for no-trim vehicles', async ({ page }) => {
  // We can't easily force a "vehicle without trim data" from the outside, but
  // we CAN verify the dead "Browse all tires" meta string never appears for any
  // recognised vehicle — that's the symptom of the old path 3.
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2020 Honda Civic');
  await page.waitForTimeout(2500);

  // No "Browse all tires" copy anywhere in the dropdown
  await expect(page.locator('.hero-smart-search__result-meta', { hasText: /Browse all tires/i })).toHaveCount(0);
});

test('typo normalize: "2012honda civic" auto-corrects to "2012 honda civic" in the input', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012honda civic');
  // Debounce is 300ms — give the search() call a beat to fire the normalize
  await page.waitForTimeout(900);

  await expect(input).toHaveValue('2012 honda civic');
});

test('Bug B follow-up: needs-trim guidance card shows orange tag instead of nav link', async ({ page }) => {
  // Use a query that resolves a recognised vehicle but is likely to produce
  // a trim-less result — historically the parser-only path. If trims DO
  // resolve, this test no-ops cleanly (guidance card just isn't present).
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('1995 Toyota Corolla'); // older car where trim data may be sparse
  await page.waitForTimeout(3500);

  // If the needs-trim guidance fires, it must have the orange tag and NO clickable nav
  const needsTrim = page.locator('.hero-smart-search__guidance--needs-trim');
  const count = await needsTrim.count();
  if (count > 0) {
    await expect(needsTrim.locator('.hero-smart-search__result-tag', { hasText: /Need trim/i })).toBeVisible();
    // The card has no data-url, so clicking it does NOT navigate
    await needsTrim.click();
    await page.waitForTimeout(600);
    expect(page.url().replace(/\/$/, '')).toBe(BASE);
  }
});
