// @ts-check
/**
 * Mobile compare flow — tap targets + sticky labels + full-height modal.
 *
 * Run: npx playwright test tests/collection-compare-mobile.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires?filter.p.vendor=Michelin';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test('1. Compare checkbox tap target ≥ 18px on mobile', async ({ page }) => {
  await page.goto(COLLECTION);
  const first = page.locator('.ptg__compare-check').first();
  if (await first.count() === 0) test.skip(true, 'Enable compare in section settings');
  const box = await first.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(17.5);
  expect(box.height).toBeGreaterThanOrEqual(17.5);
});

test('2. Tray stacks items above the buttons on mobile', async ({ page }) => {
  await page.goto(COLLECTION);
  const checks = page.locator('.ptg__compare-check');
  await checks.nth(0).check({ force: true });
  await checks.nth(1).check({ force: true });
  const tray = page.locator('[data-compare-tray]');
  await expect(tray).toHaveClass(/is-visible/);

  const itemsBox = await page.locator('[data-compare-items]').boundingBox();
  const btnBox = await page.locator('[data-compare-open]').boundingBox();
  // items should sit ABOVE the Compare button (smaller y means higher on screen)
  expect(itemsBox.y).toBeLessThan(btnBox.y);
});

test('3. Compare button is at least 36px tall on mobile (touch target)', async ({ page }) => {
  await page.goto(COLLECTION);
  const checks = page.locator('.ptg__compare-check');
  await checks.nth(0).check({ force: true });
  await checks.nth(1).check({ force: true });
  const btnBox = await page.locator('[data-compare-open]').boundingBox();
  expect(btnBox.height).toBeGreaterThanOrEqual(35);
});

test('4. Modal goes full-height on mobile + label column is sticky', async ({ page }) => {
  await page.goto(COLLECTION);
  const checks = page.locator('.ptg__compare-check');
  await checks.nth(0).check({ force: true });
  await checks.nth(1).check({ force: true });
  await page.locator('[data-compare-open]').click();
  const content = page.locator('.ptg__compare-modal-content');
  await expect(content).toBeVisible();
  const box = await content.boundingBox();
  // 390x844 viewport, mobile modal fills the screen
  expect(box.height).toBeGreaterThanOrEqual(800);

  // Sticky <th> on mobile = position: sticky
  const pos = await page.locator('.ptg__cmp-table th').first().evaluate(el => getComputedStyle(el).position);
  expect(pos).toBe('sticky');
});
