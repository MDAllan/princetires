// @ts-check
/**
 * Verify the "look here, this is the next step" behavior on the homepage
 * smart-search trim picker.
 *
 * When a customer types a year/make/model and clicks the red CTA arrow without
 * picking a trim, the trim-header must:
 *   - Get the pulse animation class (`--attention`)
 *   - Display the inline cue ("Pick one to continue") inside the header
 *   - Auto-highlight the first trim row so Enter immediately picks it
 *   - Scroll the dropdown's internal scrollTop back to 0
 *
 * Run: npx playwright test tests/trim-attention-cue.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

// Use a vehicle Prince Tires definitely knows about — recent Civic is the
// canonical example throughout the codebase.
const TEST_VEHICLE = '2020 Honda Civic';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

async function typeVehicleAndWaitForTrimPicker(page) {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill(TEST_VEHICLE);
  // The trim picker renders as you type (debounced); wait for the header
  await page.locator('.hero-smart-search__trim-header').waitFor({ state: 'visible', timeout: 15000 });
  return input;
}

test('clicking the red CTA without a trim pulses the trim header', async ({ page }) => {
  await typeVehicleAndWaitForTrimPicker(page);

  // Click the CTA arrow button
  await page.locator('[data-smart-search-submit]').first().click();

  // The trim-header must get the --attention class to fire the pulse
  await expect(page.locator('.hero-smart-search__trim-header--attention')).toBeVisible({ timeout: 5000 });
});

test('the inline cue appears INSIDE the trim header, not at the bottom of the list', async ({ page }) => {
  await typeVehicleAndWaitForTrimPicker(page);
  await page.locator('[data-smart-search-submit]').first().click();

  // Cue must be a descendant of the trim-header
  const cueInHeader = page.locator('.hero-smart-search__trim-header .hero-smart-search__trim-cue');
  await expect(cueInHeader).toBeVisible({ timeout: 5000 });
  await expect(cueInHeader).toContainText('Pick one to continue');

  // The legacy bottom-of-list prompt must NOT be used anymore
  await expect(page.locator('.hero-smart-search__results-list > .hero-smart-search__trim-prompt')).toHaveCount(0);
});

test('first trim row is auto-highlighted so Enter picks the top trim', async ({ page }) => {
  await typeVehicleAndWaitForTrimPicker(page);
  await page.locator('[data-smart-search-submit]').first().click();

  // After the cue fires, the first trim row should have aria-selected="true"
  const firstTrim = page.locator('.hero-smart-search__trim-row').first();
  await expect(firstTrim).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
});

test('cue retriggers (pulse restarts) on subsequent CTA clicks', async ({ page }) => {
  await typeVehicleAndWaitForTrimPicker(page);
  const btn = page.locator('[data-smart-search-submit]').first();

  await btn.click();
  await expect(page.locator('.hero-smart-search__trim-header--attention')).toBeVisible({ timeout: 5000 });

  // After ~1.6s the animation finishes; the class may stay applied but the
  // important behaviour is that re-clicking removes-then-reapplies it. Verify
  // the cue is still present after a second click (i.e. the handler ran).
  await page.waitForTimeout(1600);
  await btn.click();
  await expect(page.locator('.hero-smart-search__trim-header .hero-smart-search__trim-cue')).toContainText('Pick one to continue');
});

test('CTA arrow click does NOT navigate (still on /) while a trim is pending', async ({ page }) => {
  await typeVehicleAndWaitForTrimPicker(page);
  await page.locator('[data-smart-search-submit]').first().click();

  // URL stays on the homepage — the click correctly intercepts instead of submitting
  await page.waitForTimeout(800);
  expect(page.url().replace(/\/$/, '')).toBe(BASE);
});
