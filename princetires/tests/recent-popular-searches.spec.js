// @ts-check
/**
 * Recent + popular searches on empty focus.
 *
 * - Empty input + focused: dropdown shows POPULAR chips
 * - After a successful search: query is saved to localStorage
 * - Next empty focus: dropdown shows the RECENT chip
 * - Clicking a recent/popular chip fills the input and re-runs the search
 * - "Clear" wipes the recent list
 * - Both the homepage hero AND the header overlay use the same key,
 *   so a search on either surface shows up as recent on the other
 *
 * Run: npx playwright test tests/recent-popular-searches.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';
const KEY  = 'pt-recent-searches';

// NOTE: do NOT use addInitScript to clear localStorage — addInitScript fires
// on EVERY page navigation, which would wipe any value the page just saved.
// Each test that needs an empty store calls clearKey() once after first goto.
async function clearKey(page) {
  await page.evaluate(() => {
    try { localStorage.removeItem('pt-recent-searches'); } catch (e) {}
  });
}

/* ──────────── Homepage hero smart-search ──────────── */

test('homepage: empty focus shows the Popular chips', async ({ page }) => {
  await page.goto(BASE);
  await clearKey(page);
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.click();

  await expect(page.locator('.hero-smart-search__empty-state')).toBeVisible({ timeout: 5000 });
  // 4 popular chips (or more if recent exists). Filter to non-recent only:
  const popularChips = page.locator('.hero-smart-search__empty-chip').locator(':not(.hero-smart-search__empty-chip--recent)');
  await expect(popularChips).toHaveCount(4);
  // Sample of expected popular labels
  const texts = await popularChips.allTextContents();
  expect(texts.join(' ')).toMatch(/Michelin/);
  expect(texts.join(' ')).toMatch(/Tire rotation/i);
});

test('homepage: searching saves the query as a recent search', async ({ page }) => {
  await page.goto(BASE);
  await clearKey(page);
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.fill('225/65R17');
  // Submit via the arrow CTA — this should navigate AND save the query
  await page.locator('[data-smart-search-submit]').first().click();
  await page.waitForURL(/tire_width=225/);

  const stored = await page.evaluate(() => localStorage.getItem('pt-recent-searches'));
  expect(stored).toBeTruthy();
  expect(JSON.parse(stored)).toContain('225/65R17');
});

test('homepage: recent chip shows next time + clicking it re-runs the search', async ({ page }) => {
  // Seed a recent search
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('pt-recent-searches', JSON.stringify(['2020 Honda Civic']));
  });
  await page.reload();
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.click();

  // Recent chip is visible with the right text
  const recentChip = page.locator('.hero-smart-search__empty-chip--recent', { hasText: '2020 Honda Civic' });
  await expect(recentChip).toBeVisible({ timeout: 5000 });

  // Click it → input filled, search re-runs
  await recentChip.click();
  await expect(input).toHaveValue('2020 Honda Civic');
});

test('homepage: Clear button wipes recent searches', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('pt-recent-searches', JSON.stringify(['225/65R17', 'Michelin']));
  });
  await page.reload();
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.click();

  await expect(page.locator('.hero-smart-search__empty-chip--recent')).toHaveCount(2);
  await page.locator('[data-clear-recent]').first().click();

  await expect(page.locator('.hero-smart-search__empty-chip--recent')).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('pt-recent-searches'));
  expect(stored).toBeNull();
});

/* ──────────── Header overlay ──────────── */

test('header overlay: empty focus shows the Popular chips', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('[data-pt-search-trigger]').locator('visible=true').first().click();
  const input = page.locator('#pt-header-search-input');
  await input.waitFor({ state: 'visible', timeout: 8000 });
  await input.focus();

  await expect(page.locator('.pt-search-suggest__empty-state')).toBeVisible({ timeout: 5000 });
  const popularChips = page.locator('.pt-search-suggest__empty-chip').locator(':not(.pt-search-suggest__empty-chip--recent)');
  await expect(popularChips).toHaveCount(4);
});

test('header overlay shares the recent-search key with the homepage', async ({ page }) => {
  // Save a recent search on the homepage first
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('pt-recent-searches', JSON.stringify(['Michelin']));
  });
  await page.reload();

  // Open the header overlay — it should show the same Michelin chip
  await page.locator('[data-pt-search-trigger]').locator('visible=true').first().click();
  const headerInput = page.locator('#pt-header-search-input');
  await headerInput.waitFor({ state: 'visible', timeout: 8000 });
  await headerInput.focus();

  await expect(page.locator('.pt-search-suggest__empty-chip--recent', { hasText: 'Michelin' })).toBeVisible({ timeout: 5000 });
});
