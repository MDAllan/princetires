// @ts-check
/**
 * Popular models pill row above the grid.
 *
 * Run: npx playwright test tests/collection-popular-models.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test('1. Popular models row renders with up to 10 pills', async ({ page }) => {
  await page.goto(COLLECTION);
  const row = page.locator('[data-popular-models]');
  await expect(row).toBeVisible();
  const pills = page.locator('.ptg__popular-model-pill');
  const count = await pills.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(10);
});

test('2. Each pill href filters by tire_model', async ({ page }) => {
  await page.goto(COLLECTION);
  const first = page.locator('.ptg__popular-model-pill').first();
  const href = await first.getAttribute('href');
  expect(href).toContain('/collections/tires?filter.p.m.custom.tire_model=');
});

test('3. Clicking a pill applies the model filter to the URL', async ({ page }) => {
  await page.goto(COLLECTION);
  const firstPill = page.locator('.ptg__popular-model-pill').first();
  const modelName = await firstPill.getAttribute('data-filter-value');
  await Promise.all([
    page.waitForURL(/tire_model=/, { timeout: 5000 }),
    firstPill.click()
  ]);
  expect(page.url()).toContain('filter.p.m.custom.tire_model=');
  // Picked model name is part of the URL (URL-encoded)
  const encoded = encodeURIComponent(modelName).replace(/%20/g, '+');
  expect(page.url()).toContain('tire_model=' + encoded);
});

test('4. Pill shows model name + count badge', async ({ page }) => {
  await page.goto(COLLECTION);
  const first = page.locator('.ptg__popular-model-pill').first();
  const cnt = await first.locator('.ptg__popular-model-cnt').textContent();
  expect(cnt).toMatch(/^\d+$/);
});
