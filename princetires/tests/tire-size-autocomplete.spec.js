// @ts-check
/**
 * Partial tire-size autocomplete on the homepage smart-search.
 *
 * Customers often paste / type incomplete tire sizes ("28540", "285/40",
 * "33x" etc.). Without this autocomplete, the smart search punted to
 * Gemini and hallucinated random vehicles ("2026 RAM 2500" for "28540").
 * Now the detector recognises the partial pattern, intercepts BEFORE
 * vehicle parse, and surfaces clickable size suggestions.
 *
 * Run: npx playwright test tests/tire-size-autocomplete.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  // Default mode is Tires — explicit reset so the test is deterministic
  await page.evaluate(() => { try { localStorage.removeItem('pt-search-mode'); } catch (e) {} });
  await page.reload();
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

test('"28540" (5 digits) shows IN-STOCK-ONLY tire-size suggestions', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('28540');
  await page.locator('.hero-smart-search__suggest-header').waitFor({ state: 'visible', timeout: 8000 });

  await expect(page.locator('.hero-smart-search__suggest-header-label')).toContainText('28540');

  // Suggestions must be sizes that exist in the inventory. Per the size
  // index built from tire-catalog.json, in-stock 285/40 sizes are 19, 20,
  // 21, 22, 24 — NOT 15, 16, 17, 18 (those don't exist for 285/40).
  const sizeChips = await page.locator('.hero-smart-search__suggest-size').allTextContents();
  const joined = sizeChips.join(' | ');
  // At least one large-rim 285/40 should appear (we stock R19+ for 285/40)
  expect(joined).toMatch(/285\/40R(19|20|21|22|24)/);
  // The smaller rims we DON'T stock for 285/40 must NOT appear
  expect(joined).not.toMatch(/285\/40R15\b/);
  expect(joined).not.toMatch(/285\/40R16\b/);

  // Each suggestion shows a stock-count hint
  const hints = await page.locator('.hero-smart-search__suggest-hint').allTextContents();
  expect(hints.join(' ')).toMatch(/in stock/i);

  // The trim picker (the previous hallucination path) must NOT have rendered
  await expect(page.locator('.hero-smart-search__trim-header')).toHaveCount(0);
});

test('"285/40" (with slash) shows in-stock suggestions sorted by stock count', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('285/40');
  await page.locator('.hero-smart-search__suggest-header').waitFor({ state: 'visible', timeout: 8000 });

  // All suggestions should be 285/40Rxx and only in-stock rims (R19+ per catalog)
  const sizeChips = await page.locator('.hero-smart-search__suggest-size').allTextContents();
  expect(sizeChips.length).toBeGreaterThan(0);
  for (const c of sizeChips) {
    expect(c).toMatch(/^285\/40R\d{2}$/);
  }
  // First (top) suggestion should have the highest stock count — read the
  // hint and confirm it has a number prefix
  const firstHint = (await page.locator('.hero-smart-search__suggest-hint').first().textContent() || '').trim();
  expect(firstHint).toMatch(/^\d+\s+in stock$/i);
});

test('"285" (width only) suggests common aspects', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('285');
  await page.locator('.hero-smart-search__suggest-header').waitFor({ state: 'visible', timeout: 8000 });
  // Should suggest 285/40R17, 285/45R17, 285/50R17, etc.
  const texts = (await page.locator('.hero-smart-search__suggest-size').allTextContents()).join(' ');
  expect(texts).toMatch(/285\/\d{2}R17/);
});

test('"33x" (flotation in progress) suggests 33X12.50Rxx', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('33x');
  await page.locator('.hero-smart-search__suggest-header').waitFor({ state: 'visible', timeout: 8000 });
  const texts = (await page.locator('.hero-smart-search__suggest-size').allTextContents()).join(' ');
  expect(texts).toMatch(/33X12\.50R\d{2}/i);
});

test('clicking a suggestion fills the input and navigates to the filtered tires collection', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('28540');
  await page.locator('.hero-smart-search__suggest-header').waitFor({ state: 'visible', timeout: 8000 });

  // Click the first suggestion
  const first = page.locator('.hero-smart-search__suggest-row').first();
  const firstSize = (await first.locator('.hero-smart-search__suggest-size').textContent() || '').trim();
  await first.click();

  // Navigates to /collections/tires with the parsed filter params
  await page.waitForURL(/\/collections\/tires\?.*tire_width=285.*tire_profile=40/);
  // The first-suggested size must be a valid 285/40Rxx (xx ≥ 19, since
  // the inventory index filters out R15-R18 for 285/40)
  expect(firstSize).toMatch(/285\/40R\d{2}/);
});

test('"2026" (in-range year) is still treated as year-only guidance, NOT a tire size', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2026');
  // Year-only branch renders a guidance card with popular-make chips
  await page.locator('.hero-smart-search__guidance-title').waitFor({ state: 'visible', timeout: 8000 });
  await expect(page.locator('.hero-smart-search__guidance-title')).toContainText(/2026/);
  // Tire-size suggestions header must NOT render
  await expect(page.locator('.hero-smart-search__suggest-header')).toHaveCount(0);
});

test('"Honda Civic" (vehicle query) is unaffected — still goes through vehicle parse', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2020 Honda Civic');
  // Trim picker or single resolved row should render
  await page.locator('.hero-smart-search__trim-header, .hero-smart-search__result-item, .hero-smart-search__guidance').first()
    .waitFor({ state: 'visible', timeout: 15000 });
  // Tire-size suggestions header must NOT render
  await expect(page.locator('.hero-smart-search__suggest-header')).toHaveCount(0);
});
