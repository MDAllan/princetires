// @ts-check
/**
 * Verify the universal header-search dropdown:
 *  - Opens the overlay modal via the magnifying-glass trigger
 *  - As the customer types, Shopify's /search/suggest.json is fetched and
 *    a grouped dropdown is rendered (products / collections / pages / articles)
 *  - A "⚡ Quick action" row is pinned at the top for tire sizes, services,
 *    seasons, and rims/wheels
 *  - Enter on a non-shortcut query falls through to Shopify's /search?q=
 *  - Empty / too-short queries hide the dropdown
 *
 * Run: npx playwright test tests/header-predictive-search.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

async function openSearchOverlay(page) {
  await page.goto(BASE);
  // Click the desktop or mobile search trigger
  const trigger = page.locator('[data-pt-search-trigger]').first();
  await trigger.waitFor({ state: 'visible', timeout: 15000 });
  await trigger.click();
  const input = page.locator('#pt-header-search-input');
  await input.waitFor({ state: 'visible', timeout: 8000 });
  return input;
}

test('typing a brand name renders products + collections in the dropdown', async ({ page }) => {
  const input = await openSearchOverlay(page);
  await input.fill('Michelin');
  // Wait for the suggest API to resolve + dropdown to render
  await page.locator('.pt-search-suggest').waitFor({ state: 'visible', timeout: 8000 });

  // At least one section header should be visible
  const labels = await page.locator('.pt-search-suggest__section-label').allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  // Michelin should surface products (the brand has many)
  await expect(page.locator('.pt-search-suggest__item--product').first()).toBeVisible({ timeout: 5000 });
});

test('typing a tire size shows the ⚡ Quick action row at the top', async ({ page }) => {
  const input = await openSearchOverlay(page);
  await input.fill('225/65R17');
  await page.locator('.pt-search-suggest__item--quick').waitFor({ state: 'visible', timeout: 8000 });

  // The quick-action label includes the canonical size
  await expect(page.locator('.pt-search-suggest__item--quick')).toContainText(/225\/65R17/i);
  // And its href is the filtered tires collection
  await expect(page.locator('.pt-search-suggest__item--quick')).toHaveAttribute('href', /tire_width=225/);
});

test('typing a service keyword shows a service Quick action', async ({ page }) => {
  const input = await openSearchOverlay(page);
  await input.fill('tire rotation');
  await page.locator('.pt-search-suggest__item--quick').waitFor({ state: 'visible', timeout: 8000 });

  await expect(page.locator('.pt-search-suggest__item--quick')).toHaveAttribute('href', /\/pages\/tire-rotation/);
});

test('Enter on a non-shortcut query falls through to /search?q=', async ({ page }) => {
  const input = await openSearchOverlay(page);
  // A query that won't match a size / service / season / rims shortcut
  await input.fill('warranty');
  await page.waitForTimeout(400);
  await input.press('Enter');

  await page.waitForURL(/\/search\?q=warranty/i, { timeout: 10000 });
});

test('empty / 1-char query keeps the dropdown hidden', async ({ page }) => {
  const input = await openSearchOverlay(page);
  await input.fill('a');
  await page.waitForTimeout(600);
  await expect(page.locator('.pt-search-suggest')).toBeHidden();
});

// (Analytics emission is exercised by tests/year-only-make-chips.spec.js,
//  which uses the same PTTireParse.track → dataLayer.push path.)
