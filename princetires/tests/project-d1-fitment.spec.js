// @ts-check
/**
 * Project D.1 — Code-only fitment correctness acceptance.
 * Tests against live princetires.ca after push.
 *
 * Run: npx playwright test tests/project-d1-fitment.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';
const PAGE = '/pages/booking';

async function openWidget(page) {
  await page.goto(`${BASE}${PAGE}`);
  await page.locator('[data-bp-path="buy"]').click();
  await page.locator('#bp-buy').waitFor({ state: 'visible' });
}

/**
 * Drive the vehicle cascade to a known staggered trim (2020 BMW M2).
 * If the trim isn't actually staggered in the data, subsequent tests will skip.
 */
async function pickStaggeredVehicle(page) {
  await page.locator('[data-pt-ts-tab="vehicle"]').click();
  await page.locator('[data-pt-ts-year]').selectOption('2020');
  await page.locator('[data-pt-ts-make] option[value="BMW"]').waitFor({ state: 'attached', timeout: 5000 });
  await page.locator('[data-pt-ts-make]').selectOption('BMW');
  await page.locator('[data-pt-ts-model] option[value="M2"]').waitFor({ state: 'attached', timeout: 5000 });
  await page.locator('[data-pt-ts-model]').selectOption('M2');
  await page.locator('[data-pt-ts-trim]').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  const firstTrim = await page.locator('[data-pt-ts-trim] option:not([value=""])').first().getAttribute('value');
  if (firstTrim) {
    await page.locator('[data-pt-ts-trim]').selectOption(firstTrim);
    await page.waitForTimeout(500);
  }
}

test('1. Staggered match card has Front/Rear/Both radio group in DOM', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.removeItem('pt-tire-search-filters');
    localStorage.removeItem('pt-tire-search-vehicle');
  });
  await openWidget(page);
  await pickStaggeredVehicle(page);

  await expect(page.locator('[data-pt-ts-stagger-pick]')).toBeAttached();
  await expect(page.locator('input[name="pt-ts-stagger-pick"][value="front"]')).toBeAttached();
  await expect(page.locator('input[name="pt-ts-stagger-pick"][value="rear"]')).toBeAttached();
  await expect(page.locator('input[name="pt-ts-stagger-pick"][value="both"]')).toBeAttached();
});

test('2. Front pick submits the front size', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);
  await pickStaggeredVehicle(page);

  const staggerVisible = await page.locator('[data-pt-ts-veh-stagger]').isVisible();
  test.skip(!staggerVisible, 'Trim is not staggered in current data');

  const frontSize = await page.locator('[data-pt-ts-veh-front]').textContent();
  await page.locator('input[name="pt-ts-stagger-pick"][value="front"]').check();

  await page.route('**/collections/tires*', route => route.fulfill({ status: 200, body: 'ok' }));
  let target = '';
  page.on('request', req => { if (req.url().includes('/collections/tires')) target = req.url(); });
  await page.locator('[data-pt-ts-submit-veh]').click();
  await page.waitForTimeout(500);

  const m = frontSize.match(/(\d{3})/);
  if (m) expect(target).toContain('tire_width=' + m[1]);
});

test('3. Rear pick submits the rear size', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);
  await pickStaggeredVehicle(page);

  const staggerVisible = await page.locator('[data-pt-ts-veh-stagger]').isVisible();
  test.skip(!staggerVisible, 'Trim is not staggered in current data');

  const rearSize = await page.locator('[data-pt-ts-veh-rear]').textContent();
  await page.locator('input[name="pt-ts-stagger-pick"][value="rear"]').check();

  await page.route('**/collections/tires*', route => route.fulfill({ status: 200, body: 'ok' }));
  let target = '';
  page.on('request', req => { if (req.url().includes('/collections/tires')) target = req.url(); });
  await page.locator('[data-pt-ts-submit-veh]').click();
  await page.waitForTimeout(500);

  const m = rearSize.match(/(\d{3})/);
  if (m) expect(target).toContain('tire_width=' + m[1]);
});

test('4. Both pick produces URL with multiple tire_width params', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('pt-tire-search-filters'));
  await openWidget(page);
  await pickStaggeredVehicle(page);

  const staggerVisible = await page.locator('[data-pt-ts-veh-stagger]').isVisible();
  test.skip(!staggerVisible, 'Trim is not staggered in current data');

  const bothHidden = await page.locator('[data-pt-ts-stagger-both]').evaluate(el => el.hidden);
  test.skip(bothHidden, 'Front and rear aspects differ; "Shop both" not offered');

  await page.locator('input[name="pt-ts-stagger-pick"][value="both"]').check();

  await page.route('**/collections/tires*', route => route.fulfill({ status: 200, body: 'ok' }));
  let target = '';
  page.on('request', req => { if (req.url().includes('/collections/tires')) target = req.url(); });
  await page.locator('[data-pt-ts-submit-veh]').click();
  await page.waitForTimeout(500);

  const widthCount = (target.match(/tire_width=/g) || []).length;
  expect(widthCount).toBeGreaterThanOrEqual(2);
});

test('5. parseSize source includes flotation pattern', async ({ page }) => {
  await page.goto(`${BASE}${PAGE}`);
  await page.locator('[data-bp-path="buy"]').click();
  await page.locator('#bp-buy').waitFor({ state: 'visible' });

  // Pull the rendered HTML and verify the deployed snippet contains the flotation regex
  const html = await page.evaluate(async () => {
    const res = await fetch(window.location.href);
    return await res.text();
  });
  expect(html).toContain('flotation');
  expect(html).toMatch(/\(\\d\{2\}\)X/);
});
