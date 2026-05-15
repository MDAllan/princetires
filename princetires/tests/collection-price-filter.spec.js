// @ts-check
/**
 * Regression test for the price filter on the collection page.
 *
 * Bug history: pt-collection-grid.liquid was emitting filter.price.min /
 * filter.price.max, which Shopify silently ignores. Switched to
 * filter.v.price.gte / filter.v.price.lte, the storefront filtering
 * convention for variant price ranges.
 *
 * Run: npx playwright test tests/collection-price-filter.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test('1. Slider thumbs reflect filter.v.price.gte / .lte from URL on load', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.v.price.gte=120&filter.v.price.lte=300');
  const minVal = await page.locator('[data-price-min]').inputValue();
  const maxVal = await page.locator('[data-price-max]').inputValue();
  expect(minVal).toBe('120');
  expect(maxVal).toBe('300');
  // Display labels match
  await expect(page.locator('[data-price-min-display]')).toContainText('$120');
  await expect(page.locator('[data-price-max-display]')).toContainText('$300');
});

test('2. Tight band (0-50) returns 0 products — filter is honoured by Shopify', async ({ page }) => {
  // Very narrow band that should match nothing (tires start ~$80).
  await page.goto(COLLECTION + '?filter.v.price.gte=0&filter.v.price.lte=50');
  const cards = await page.locator('a.ptg__card').count();
  // Empty state should render (0 cards)
  expect(cards).toBe(0);
});

test('3. All visible prices fall inside the slider band', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.v.price.gte=100&filter.v.price.lte=200');
  const cards = page.locator('.ptg__card[data-price]');
  const n = await cards.count();
  if (n === 0) test.skip(true, 'No cards in this band — broaden the test');
  for (let i = 0; i < Math.min(n, 12); i++) {
    const priceText = await cards.nth(i).getAttribute('data-price');
    const price = parseFloat((priceText || '0').replace(/[^0-9.]/g, ''));
    expect(price).toBeGreaterThanOrEqual(100);
    expect(price).toBeLessThanOrEqual(200);
  }
});

test('4. Changing the slider emits filter.v.price.gte / .lte (not the old names)', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');

  // Move the min slider and wait for the debounced navigation (800ms).
  await Promise.all([
    page.waitForURL(/filter\.v\.price\.gte/, { timeout: 5000 }),
    page.evaluate(() => {
      const min = document.querySelector('[data-price-min]');
      min.value = '50';
      min.dispatchEvent(new Event('input', { bubbles: true }));
      min.dispatchEvent(new Event('change', { bubbles: true }));
    })
  ]);

  const finalUrl = page.url();
  expect(finalUrl).toContain('filter.v.price.gte=50');
  expect(finalUrl).not.toContain('filter.price.min');
});
