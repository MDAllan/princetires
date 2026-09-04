// @ts-check
/**
 * Single-candidate inline ghost-text autocomplete.
 *
 *   - "2012 Honda Civi"  → ghost suffix "c"  (one obvious finish)
 *   - "2012 Honda"       → NO ghost          (multiple candidates → chips)
 *   - "Mich"             → ghost "elin"      (single brand match)
 *   - "Toy"              → NO ghost          (Toyota / Toyo — ambiguous)
 *   - Pressing Tab at end-of-input commits the suggestion
 *   - Mid-string Tab does NOT hijack the key (native focus-move preserved)
 *
 * Run: npx playwright test tests/ghost-autocomplete.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => { try { localStorage.removeItem('pt-search-mode'); } catch (e) {} });
  await page.reload();
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

test('partial model with one obvious finish renders ghost suffix', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012 Honda Civi');
  // Ghost hydrates after the year data file loads — give it a moment
  await page.locator('[data-ghost]:not(.is-hidden)').first().waitFor({ timeout: 8000 });
  const suffix = (await page.locator('[data-ghost-suffix]').first().textContent() || '').trim();
  expect(suffix.toLowerCase()).toBe('c');
});

test('year+make alone (no model prefix) does NOT ghost — multiple candidates', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012 Honda');
  await page.waitForTimeout(800);
  // Ghost should be hidden OR have empty suffix
  const ghost = page.locator('[data-ghost]').first();
  const cls = (await ghost.getAttribute('class')) || '';
  const suffix = (await page.locator('[data-ghost-suffix]').first().textContent() || '').trim();
  expect(cls.includes('is-hidden') || suffix === '').toBeTruthy();
});

test('unique brand prefix ghosts to the full brand name', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('Mich');
  await page.locator('[data-ghost]:not(.is-hidden)').first().waitFor({ timeout: 4000 });
  const suffix = (await page.locator('[data-ghost-suffix]').first().textContent() || '').trim();
  expect(suffix.toLowerCase()).toBe('elin');
});

test('ambiguous brand prefix ("Mi" → Michelin + Mickey Thompson) does NOT ghost', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('Mi');
  await page.waitForTimeout(500);
  const cls = (await page.locator('[data-ghost]').first().getAttribute('class')) || '';
  const suffix = (await page.locator('[data-ghost-suffix]').first().textContent() || '').trim();
  expect(cls.includes('is-hidden') || suffix === '').toBeTruthy();
});

test('Tab at end of input accepts the ghost suggestion', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2012 Honda Civi');
  await page.locator('[data-ghost]:not(.is-hidden)').first().waitFor({ timeout: 8000 });
  await input.press('Tab');
  await expect(input).toHaveValue('2012 Honda Civic');
  // Ghost cleared after accept
  const cls = (await page.locator('[data-ghost]').first().getAttribute('class')) || '';
  expect(cls).toContain('is-hidden');
});

test('ArrowRight at end of input also accepts the ghost', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('Mich');
  await page.locator('[data-ghost]:not(.is-hidden)').first().waitFor({ timeout: 4000 });
  await input.press('ArrowRight');
  await expect(input).toHaveValue('Michelin');
});

test('trailing space suppresses the ghost (customer about to start a new token)', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('Mich ');
  await page.waitForTimeout(400);
  const cls = (await page.locator('[data-ghost]').first().getAttribute('class')) || '';
  expect(cls).toContain('is-hidden');
});
