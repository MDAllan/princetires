// @ts-check
/**
 * Verify the "use the year you DO have" feature on the homepage smart-search.
 *
 * Typing a year-only query (e.g. "2012") must render guidance with clickable
 * make chips. Clicking a chip must fill the input with "<year> <make>" and
 * re-run the search, which then renders the year-make guidance ("Almost — what
 * model?").
 *
 * Run: npx playwright test tests/year-only-make-chips.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

test('year-only "2012" renders guidance with make chips', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012');
  // Year-only is detected on submit (typed input doesn't auto-fire guidance).
  await input.press('Enter');

  // Guidance card should appear with the year-only title
  const title = page.locator('.hero-smart-search__guidance-title');
  await title.waitFor({ state: 'visible', timeout: 10000 });
  await expect(title).toContainText('2012');
  await expect(title).toContainText('what car');

  // At least 8 popular-make chips render
  const chips = page.locator('.hero-smart-search__guidance-chip');
  await expect(chips).toHaveCount(8);

  // Sample of expected makes
  const chipTexts = await chips.allTextContents();
  expect(chipTexts).toEqual(expect.arrayContaining(['Honda', 'Toyota', 'Ford', 'GMC']));
});

test('clicking a make chip fills "<year> <make>" and shows year-make guidance', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012');
  await input.press('Enter');

  // Wait for year-only guidance to render
  await page.locator('.hero-smart-search__guidance-chip').first().waitFor({ state: 'visible', timeout: 10000 });

  // Click the Honda chip
  await page.locator('.hero-smart-search__guidance-chip', { hasText: 'Honda' }).click();

  // Input should now be "2012 Honda"
  await expect(input).toHaveValue('2012 Honda');

  // The search should re-run and render the year-make guidance ("Almost — what model?")
  const title = page.locator('.hero-smart-search__guidance-title');
  await expect(title).toContainText('what model', { timeout: 10000 });

  // The sub line should reference "Honda" so the customer sees they're on the right track
  const sub = page.locator('.hero-smart-search__guidance-sub');
  await expect(sub).toContainText('Honda');
});

test('chips do NOT appear for year-make ("2012 Honda") — only for year-only', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012 Honda');
  await input.press('Enter');

  // Year-make guidance should render
  await page.locator('.hero-smart-search__guidance-title', { hasText: 'what model' }).waitFor({ state: 'visible', timeout: 10000 });

  // No chips on year-make
  await expect(page.locator('.hero-smart-search__guidance-chip')).toHaveCount(0);
});

test('chips do NOT appear for make-only ("Honda") — only for year-only', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('Honda');
  await input.press('Enter');

  // Make-only guidance should render
  await page.locator('.hero-smart-search__guidance-title', { hasText: /Honda/i }).waitFor({ state: 'visible', timeout: 10000 });

  // No chips on make-only
  await expect(page.locator('.hero-smart-search__guidance-chip')).toHaveCount(0);
});

test('chip click fires the guidance_chip analytics event', async ({ page }) => {
  // Seed dataLayer + capture events
  await page.addInitScript(() => {
    window.__ptEvents = [];
    window.dataLayer = window.dataLayer || [];
    const origPush = window.dataLayer.push;
    window.dataLayer.push = function() {
      for (const arg of arguments) window.__ptEvents.push(arg);
      return origPush.apply(this, arguments);
    };
  });
  await page.goto(BASE);
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });

  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012');
  await input.press('Enter');
  await page.locator('.hero-smart-search__guidance-chip').first().waitFor({ state: 'visible', timeout: 10000 });

  await page.locator('.hero-smart-search__guidance-chip', { hasText: 'Toyota' }).click();

  // Give the dataLayer push a beat
  await page.waitForTimeout(400);

  const events = await page.evaluate(() => window.__ptEvents || []);
  const chipEvent = events.find(e => e && e.event === 'pt_search' && e.search_type === 'guidance_chip');
  expect(chipEvent, 'pt_search/guidance_chip event should fire').toBeTruthy();
  expect(chipEvent.surface).toBe('homepage');
  expect(chipEvent.search_query).toBe('2012 Toyota');
});
