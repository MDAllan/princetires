// @ts-check
/**
 * Re-search strip acceptance tests.
 *
 * Run: npx playwright test tests/collection-research-strip.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test('1. Strip renders with both tabs + size panel default-active', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await expect(page.locator('[data-pt-rs]')).toBeAttached();
  await expect(page.locator('[data-pt-rs-tab="size"]')).toHaveClass(/pt-rs__tab--active/);
  await expect(page.locator('[data-pt-rs-panel="size"]')).toBeVisible();
  await expect(page.locator('[data-pt-rs-panel="vehicle"]')).toBeHidden();
});

test('2. Size dropdowns pre-fill from URL params', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=225&filter.p.m.custom.tire_profile=45&filter.p.m.custom.rim_diameter=17');
  await expect(page.locator('[data-pt-rs-width]')).toHaveValue('225');
  await expect(page.locator('[data-pt-rs-aspect]')).toHaveValue('45');
  await expect(page.locator('[data-pt-rs-rim]')).toHaveValue('17');
});

test('3. Submit Size keeps vendor + season, swaps size params', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin&filter.p.m.custom.seasonality=Winter&filter.p.m.custom.tire_width=225&filter.p.m.custom.tire_profile=45&filter.p.m.custom.rim_diameter=17');

  await page.locator('[data-pt-rs-width]').selectOption('235');
  await page.locator('[data-pt-rs-aspect]').selectOption('50');
  await page.locator('[data-pt-rs-rim]').selectOption('18');

  await Promise.all([
    page.waitForURL(/tire_width=235/, { timeout: 5000 }),
    page.locator('[data-pt-rs-submit-size]').click()
  ]);

  const url = page.url();
  expect(url).toContain('filter.p.m.custom.tire_width=235');
  expect(url).toContain('filter.p.m.custom.tire_profile=50');
  expect(url).toContain('filter.p.m.custom.rim_diameter=18');
  expect(url).toContain('filter.p.vendor=Michelin');
  expect(url).toContain('filter.p.m.custom.seasonality=Winter');
});

test('4. Tab switches to vehicle panel on click', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.locator('[data-pt-rs-tab="vehicle"]').click();
  await expect(page.locator('[data-pt-rs-panel="vehicle"]')).toBeVisible();
  await expect(page.locator('[data-pt-rs-panel="size"]')).toBeHidden();
  // Year is enabled; make/model/trim disabled until year picked
  await expect(page.locator('[data-pt-rs-year]')).toBeEnabled();
  await expect(page.locator('[data-pt-rs-make]')).toBeDisabled();
  await expect(page.locator('[data-pt-rs-model]')).toBeDisabled();
  await expect(page.locator('[data-pt-rs-trim]')).toBeDisabled();
});

test('5. Picking a year enables the make dropdown (fetches pt-vehicle-YYYY.json)', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.locator('[data-pt-rs-tab="vehicle"]').click();
  await page.locator('[data-pt-rs-year]').selectOption('2020');
  // Wait for the make dropdown to populate
  await expect(page.locator('[data-pt-rs-make]')).toBeEnabled({ timeout: 10000 });
  const makeOpts = await page.locator('[data-pt-rs-make] option').count();
  expect(makeOpts).toBeGreaterThan(5);
});

test('6. Mobile toggle button visible on small viewport; body hidden until tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  const toggle = page.locator('[data-pt-rs-toggle]');
  await expect(toggle).toBeVisible();
  const body = page.locator('[data-pt-rs-body]');
  await expect(body).toBeHidden();
  await toggle.click();
  await expect(body).toBeVisible();
});
