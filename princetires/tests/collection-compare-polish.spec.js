// @ts-check
/**
 * Compare drawer/modal polish.
 *   - tray sits above the mobile tabbar (z-index 1001, bottom offset 78+)
 *   - tray + buttons use the red brand palette
 *   - modal opens when 2+ items selected, View-tire link is a red pill
 *
 * Mobile viewport is used so the compare label is always visible (no hover).
 *
 * Run: npx playwright test tests/collection-compare-polish.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires?filter.p.vendor=Michelin';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test('1. Tray reveals after a single compare-check is ticked', async ({ page }) => {
  await page.goto(COLLECTION);
  const tray = page.locator('[data-compare-tray]');
  await expect(tray).not.toHaveClass(/is-visible/);

  const firstCheck = page.locator('.ptg__compare-check').first();
  if (await firstCheck.count() === 0) test.skip(true, 'Enable compare in the section settings');
  await firstCheck.check({ force: true });
  await expect(tray).toHaveClass(/is-visible/);
});

test('2. Tray z-index and bottom offset are above the mobile tabbar', async ({ page }) => {
  await page.goto(COLLECTION);
  const tray = page.locator('[data-compare-tray]');
  const z = await tray.evaluate(el => getComputedStyle(el).zIndex);
  const bottom = await tray.evaluate(el => getComputedStyle(el).bottom);
  expect(parseInt(z, 10)).toBeGreaterThanOrEqual(1001);
  expect(parseInt(bottom, 10)).toBeGreaterThanOrEqual(70);
});

test('3. Compare button is red (#dc2626) when enabled', async ({ page }) => {
  await page.goto(COLLECTION);
  const checks = page.locator('.ptg__compare-check');
  await checks.nth(0).check({ force: true });
  await checks.nth(1).check({ force: true });
  const btn = page.locator('[data-compare-open]');
  await expect(btn).toBeEnabled();
  // The button has `transition: background 0.15s` — wait it out before reading.
  await page.waitForTimeout(250);
  const bg = await btn.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(220, 38, 38)');
});

test('4. Modal opens with 2 items and View-tire link is a red pill', async ({ page }) => {
  // Desktop viewport so the tray's Compare button is comfortably clickable
  // (mobile tray slides up from the bottom and can race with the tabbar)
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(COLLECTION);
  const checks = page.locator('.ptg__compare-check');
  const n = await checks.count();
  if (n < 2) test.skip(true, 'Need 2+ compare checkboxes');
  await checks.nth(0).check({ force: true });
  await checks.nth(1).check({ force: true });
  await page.locator('[data-compare-open]').click();
  await expect(page.locator('[data-compare-modal]')).toBeVisible();
  const linkBg = await page.locator('.ptg__cmp-link').first().evaluate(el => getComputedStyle(el).backgroundColor);
  expect(linkBg).toBe('rgb(220, 38, 38)');
});
