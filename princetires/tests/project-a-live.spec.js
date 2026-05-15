// @ts-check
/**
 * Project A — Deep-linking + URL state acceptance tests
 *
 * Runs against the UNPUBLISHED 'Project A preview' theme on prince-tires-5560.myshopify.com.
 * Each test maps to one box in the 11-point acceptance checklist from
 * docs/superpowers/plans/2026-05-10-project-a-deep-linking.md.
 *
 * Run:
 *   npx playwright test tests/project-a-deep-linking.spec.js --project=chromium
 */

const { test, expect } = require('@playwright/test');

const STORE   = 'https://princetires.ca';
const PREVIEW = '';
const PAGE    = '/pages/booking';

function url(params = '') {
  const qs = [PREVIEW, params].filter(Boolean).join('&');
  return `${STORE}${PAGE}${qs ? '?' + qs : ''}`;
}

// The widget lives inside #bp-buy which is hidden until you click "I'm buying tires"
async function openBuyingTires(page) {
  await page.locator('[data-bp-path="buy"]').click();
  await page.locator('#bp-buy').waitFor({ state: 'visible' });
}

// Capture console errors per-test
test.beforeEach(async ({ page }, testInfo) => {
  testInfo.consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore third-party noise (Shopify CDN, GTM warnings, font preload, etc.)
      if (/cdn\.shopify\.com|googletagmanager|font preload|429|404 \(Not Found\)/.test(text)) return;
      testInfo.consoleErrors.push(text);
    }
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.consoleErrors && testInfo.consoleErrors.length) {
    console.log(`Console errors in "${testInfo.title}":`, testInfo.consoleErrors);
  }
});

// ─── 1. Shareable size search ─────────────────────────────────────────────────
test('1. Size deep-link hydrates dropdowns', async ({ page }) => {
  await page.goto(url('ts_tab=size&ts_w=225&ts_a=45&ts_r=17'));
  await openBuyingTires(page);

  const widthEl  = page.locator('[data-pt-ts-width]');
  const aspectEl = page.locator('[data-pt-ts-aspect]');
  const rimEl    = page.locator('[data-pt-ts-rim]');
  const match    = page.locator('[data-pt-ts-size-match]');
  const submit   = page.locator('[data-pt-ts-submit-size]');

  await expect(widthEl).toHaveValue('225');
  await expect(aspectEl).toHaveValue('45');
  await expect(rimEl).toHaveValue('17');
  await expect(match).toHaveText('225/45R17');
  await expect(submit).toBeEnabled();

  await page.screenshot({ path: 'test-results/1-size-deep-link.png', fullPage: false });
});

// ─── 2. Shareable vehicle search ──────────────────────────────────────────────
test('2. Vehicle deep-link hydrates cascade', async ({ page }) => {
  // LX Hatchback has 2 sizes (16" + 17"), so we also pass ts_oem to fully hydrate
  await page.goto(url('ts_tab=vehicle&ts_y=2020&ts_mk=Honda&ts_mo=Civic&ts_tr=LX%20Hatchback&ts_oem=215%2F55R16'));
  await openBuyingTires(page);

  // Vehicle tab must be active
  await expect(page.locator('[data-pt-ts-tab="vehicle"]')).toHaveAttribute('aria-selected', 'true');

  const yearEl  = page.locator('[data-pt-ts-year]');
  const makeEl  = page.locator('[data-pt-ts-make]');
  const modelEl = page.locator('[data-pt-ts-model]');
  const trimEl  = page.locator('[data-pt-ts-trim]');
  const match   = page.locator('[data-pt-ts-veh-match]');
  const submit  = page.locator('[data-pt-ts-submit-veh]');

  // The async cascade takes ~1s (network fetch for the year JSON)
  await expect(yearEl).toHaveValue('2020', { timeout: 5000 });
  await expect(makeEl).toHaveValue('Honda', { timeout: 5000 });
  await expect(modelEl).toHaveValue('Civic', { timeout: 5000 });
  await expect(trimEl).toHaveValue('LX Hatchback', { timeout: 5000 });
  await expect(match).toBeVisible({ timeout: 5000 });
  await expect(submit).toBeEnabled({ timeout: 5000 });

  await page.screenshot({ path: 'test-results/2-vehicle-deep-link.png', fullPage: false });
});

// ─── 3. Round-trip: fill → URL updates → reload restores ─────────────────────
test('3. Size dropdown changes sync to URL', async ({ page }) => {
  await page.goto(url());
  await openBuyingTires(page);

  await page.locator('[data-pt-ts-width]').selectOption('195');
  await page.locator('[data-pt-ts-aspect]').selectOption('65');
  await page.locator('[data-pt-ts-rim]').selectOption('15');

  // URL should now contain our state
  await expect(page).toHaveURL(/ts_w=195/);
  await expect(page).toHaveURL(/ts_a=65/);
  await expect(page).toHaveURL(/ts_r=15/);
  await expect(page.locator('[data-pt-ts-size-match]')).toHaveText('195/65R15');
});

// ─── 4. Clear button — size ──────────────────────────────────────────────────
test('4. Clear button resets size tab', async ({ page }) => {
  await page.goto(url('ts_tab=size&ts_w=225&ts_a=45&ts_r=17'));
  await openBuyingTires(page);

  await page.locator('[data-pt-ts-submit-size]').waitFor({ state: 'visible' });
  await page.locator('[data-pt-ts-clear="size"]').click();

  await expect(page.locator('[data-pt-ts-width]')).toHaveValue('');
  await expect(page.locator('[data-pt-ts-aspect]')).toHaveValue('');
  await expect(page.locator('[data-pt-ts-rim]')).toHaveValue('');
  await expect(page.locator('[data-pt-ts-submit-size]')).toBeDisabled();
  await expect(page.locator('[data-pt-ts-size-match]')).toHaveText('');

  // URL should drop the size params
  await expect(page).not.toHaveURL(/ts_w=/);
});

// ─── 5. Clear button — vehicle ───────────────────────────────────────────────
test('5. Clear button resets vehicle tab', async ({ page }) => {
  await page.goto(url('ts_tab=vehicle&ts_y=2020&ts_mk=Honda&ts_mo=Civic&ts_tr=LX%20Hatchback'));
  await openBuyingTires(page);

  // Wait for cascade to complete
  await expect(page.locator('[data-pt-ts-trim]')).toHaveValue('LX Hatchback', { timeout: 5000 });

  await page.locator('[data-pt-ts-clear="vehicle"]').click();

  await expect(page.locator('[data-pt-ts-year]')).toHaveValue('');
  await expect(page.locator('[data-pt-ts-veh-match]')).toBeHidden();
  await expect(page.locator('[data-pt-ts-submit-veh]')).toBeDisabled();
  await expect(page).not.toHaveURL(/ts_y=/);
});

// ─── 6. Tab swap clears stale params ─────────────────────────────────────────
test('6. Switching tabs clears the inactive tab params from URL', async ({ page }) => {
  await page.goto(url('ts_tab=size&ts_w=225&ts_a=45&ts_r=17'));
  await openBuyingTires(page);

  // Switch to vehicle tab
  await page.locator('[data-pt-ts-tab="vehicle"]').click();

  // Size params should be gone
  await expect(page).toHaveURL(/ts_tab=vehicle/);
  await expect(page).not.toHaveURL(/ts_w=/);
  await expect(page).not.toHaveURL(/ts_a=/);
  await expect(page).not.toHaveURL(/ts_r=/);
});

// ─── 7. Cache busting on year JSON fetch ─────────────────────────────────────
test('7. Year JSON fetch includes a version param', async ({ page }) => {
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('pt-vehicle-')) requests.push(req.url());
  });

  await page.goto(url());
  await openBuyingTires(page);
  await page.locator('[data-pt-ts-tab="vehicle"]').click();
  await page.locator('[data-pt-ts-year]').selectOption('2020');

  // Wait briefly for fetch
  await page.waitForTimeout(2000);

  const vehicleReq = requests.find(u => u.includes('pt-vehicle-2020.json'));
  expect(vehicleReq, 'pt-vehicle-2020.json should have been fetched').toBeTruthy();
  // Should have a query string (version param) — could be ?v=... or ?<assetVersion>
  expect(vehicleReq).toMatch(/pt-vehicle-2020\.json\?.+/);
});

// ─── 8. Missing-vehicle form UI opens ────────────────────────────────────────
test('8. Missing-vehicle form opens and Send gates on 3+ chars', async ({ page }) => {
  await page.goto(url('ts_tab=vehicle'));
  await openBuyingTires(page);

  const toggle = page.locator('[data-pt-ts-missing-toggle]');
  const body   = page.locator('[data-pt-ts-missing-body]');
  const input  = page.locator('[data-pt-ts-missing-input]');
  const send   = page.locator('[data-pt-ts-missing-send]');

  await expect(toggle).toBeVisible();
  await expect(body).toBeHidden();

  await toggle.click();
  await expect(body).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(send).toBeDisabled();

  await input.fill('ab'); // 2 chars
  await expect(send).toBeDisabled();

  await input.fill('2018 Subaru Crosstrek'); // 3+ chars
  await expect(send).toBeEnabled();

  await page.screenshot({ path: 'test-results/8-missing-vehicle-form.png', fullPage: false });
});

// ─── 9. Console errors (final sweep) ─────────────────────────────────────────
test('9. No console errors on full happy-path navigation', async ({ page }, testInfo) => {
  // Stay on this page through the typical interactions
  await page.goto(url());
  await openBuyingTires(page);
  await page.locator('[data-pt-ts-width]').selectOption('225');
  await page.locator('[data-pt-ts-aspect]').selectOption('45');
  await page.locator('[data-pt-ts-rim]').selectOption('17');
  await page.locator('[data-pt-ts-tab="vehicle"]').click();
  await page.locator('[data-pt-ts-year]').selectOption('2020');
  await page.waitForTimeout(2000); // wait for cascade
  await page.locator('[data-pt-ts-clear="vehicle"]').click();
  await page.locator('[data-pt-ts-tab="size"]').click();
  await page.locator('[data-pt-ts-clear="size"]').click();

  // Use the captured array from beforeEach
  expect(testInfo.consoleErrors, 'No JS console errors during full flow').toEqual([]);
});
