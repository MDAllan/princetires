// @ts-check
/**
 * Homepage Tires / Wheels tabs above the smart-search bar.
 *
 * - Two pill tabs render: Tires (default active) and Wheels
 * - Clicking Wheels makes it active + persists to localStorage
 * - Tire-size search on Wheels tab → /collections/wheels with the rim filter
 * - Tire-size search on Tires tab → /collections/tires with full width/profile/rim
 * - The old Shop Tires / Shop Wheels action buttons no longer render
 *
 * Run: npx playwright test tests/tires-wheels-tabs.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  // Always start in tires mode so tests are deterministic
  await page.evaluate(() => { try { localStorage.removeItem('pt-search-mode'); } catch (e) {} });
  await page.reload();
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

test('both tabs render with Tires active by default', async ({ page }) => {
  const tires  = page.locator('[data-search-mode="tires"][role="tab"]');
  const wheels = page.locator('[data-search-mode="wheels"][role="tab"]');
  await expect(tires).toBeVisible();
  await expect(wheels).toBeVisible();
  await expect(tires).toHaveAttribute('aria-selected', 'true');
  await expect(wheels).toHaveAttribute('aria-selected', 'false');
});

test('clicking Wheels toggles active state + persists to localStorage', async ({ page }) => {
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await expect(page.locator('[data-search-mode="wheels"][role="tab"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-search-mode="tires"][role="tab"]')).toHaveAttribute('aria-selected', 'false');
  const stored = await page.evaluate(() => localStorage.getItem('pt-search-mode'));
  expect(stored).toBe('wheels');
});

test('tire-size search on Tires tab → /collections/tires with width + profile + rim', async ({ page }) => {
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('225/65R17');
  await page.locator('[data-smart-search-submit]').first().click();
  await page.waitForURL(/\/collections\/tires\?.*tire_width=225.*tire_profile=65.*rim_diameter=17/);
});

test('tire-size search on Wheels tab → /collections/wheels with rim_diameter only (no tire_width/profile)', async ({ page }) => {
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('225/65R17');
  await page.locator('[data-smart-search-submit]').first().click();
  await page.waitForURL(/\/collections\/wheels/);
  const url = page.url();
  expect(url).toMatch(/rim_diameter=17/);
  expect(url).not.toMatch(/tire_width/);
  expect(url).not.toMatch(/tire_profile/);
});

test('old "Shop Tires" / "Shop Wheels" buttons no longer render', async ({ page }) => {
  // They were rendered as <a class="hero-smart-search__btn"> with the label text
  const buttons = page.locator('.hero-smart-search__btn');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const text = (await buttons.nth(i).textContent() || '').trim();
    expect(text).not.toMatch(/^Shop Tires$/i);
    expect(text).not.toMatch(/^Shop Wheels$/i);
  }
});

test('mode persists across page reload', async ({ page }) => {
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await page.reload();
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
  await expect(page.locator('[data-search-mode="wheels"][role="tab"]')).toHaveAttribute('aria-selected', 'true');
});

test('mode toggle emits pt_search analytics event', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ptEvents = [];
    window.dataLayer = window.dataLayer || [];
    const orig = window.dataLayer.push;
    window.dataLayer.push = function() {
      for (const a of arguments) window.__ptEvents.push(a);
      return orig.apply(this, arguments);
    };
  });
  await page.goto(BASE);
  await page.evaluate(() => { try { localStorage.removeItem('pt-search-mode'); } catch(e){} });
  await page.reload();
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await page.waitForTimeout(300);
  const events = await page.evaluate(() => window.__ptEvents || []);
  const toggle = events.find(e => e && e.event === 'pt_search' && e.search_type === 'mode_toggle');
  expect(toggle, 'mode_toggle pt_search event should fire').toBeTruthy();
  expect(toggle.search_mode).toBe('wheels');
});
