// @ts-check
/**
 * Wheels mode + vehicle search → fitment card.
 *
 * Phase 1 build: customer on the Wheels tab types a real vehicle ("2020 Honda
 * Civic"). The smart-search calls `/api/wheel-fitment` and renders an OEM
 * fitment card with bolt pattern, center bore, OEM wheel sizes, and diameter
 * CTAs that link to /collections/wheels?rim_diameter=<n>.
 *
 * The wheel-fitment API is intercepted with a stub so the test passes whether
 * or not the production endpoint is deployed.
 *
 * Run: npx playwright test tests/wheel-fitment-card.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

const STUB_FITMENT = {
  vehicle: { year: 2020, make: 'Honda', model: 'Civic', generation: 'X (FC) Facelift' },
  bolt_pattern: '5x114.3',
  pcd: 114.3,
  stud_holes: 5,
  center_bore: '64.1',
  trim_levels: ['EX', 'LX', 'Touring'],
  wheel_sizes: [
    { diameter: 16, width: 7, offset: 45, label: '7J×16 ET45' },
    { diameter: 17, width: 7, offset: 45, label: '7J×17 ET45' },
    { diameter: 18, width: 8, offset: 50, label: '8J×18 ET50' },
  ],
  tire_sizes: ['215/55R16', '215/50R17', '235/40ZR18'],
};

test.beforeEach(async ({ page }) => {
  // Stub the wheel-fitment endpoint so the test is independent of the prod
  // deployment of princetires-app + the upstream wheel-size API key.
  await page.route('**/api/wheel-fitment*', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_FITMENT),
    });
  });
  await page.goto(BASE);
  // Reset to Wheels tab state for every test
  await page.evaluate(() => { try { localStorage.removeItem('pt-search-mode'); } catch (e) {} });
  await page.reload();
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

test('Wheels mode + vehicle → fitment card renders with bolt pattern + OEM sizes', async ({ page }) => {
  // Switch to Wheels tab
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await expect(page.locator('[data-search-mode="wheels"][role="tab"]')).toHaveAttribute('aria-selected', 'true');

  // Type the vehicle
  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2020 Honda Civic');

  // Wait for the fitment card to render
  await page.locator('.hsf-wf').waitFor({ state: 'visible', timeout: 15000 });

  // Title shows the vehicle, subtitle is the fitment label
  await expect(page.locator('.hsf-wf__title')).toContainText(/2020.*Honda.*Civic/i);
  await expect(page.locator('.hsf-wf__subtitle')).toContainText(/fitment/i);

  // Bolt pattern + center bore visible
  await expect(page.locator('.hsf-wf__specs')).toContainText('5x114.3');
  await expect(page.locator('.hsf-wf__specs')).toContainText('64.1');

  // OEM wheel size chips
  const chips = await page.locator('.hsf-wf__chip').allTextContents();
  expect(chips.join(' ')).toMatch(/7J.*17.*ET45/);
});

test('Primary "Wheels that fit your car" CTA combines bolt_pattern + all OEM diameters', async ({ page }) => {
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await page.locator('[data-smart-search-input]').first().fill('2020 Honda Civic');
  await page.locator('.hsf-wf').waitFor({ state: 'visible', timeout: 15000 });

  const fitsCta = page.locator('[data-wf-fits]');
  await expect(fitsCta).toBeVisible();
  await expect(fitsCta).toContainText(/fit your/i);

  const href = await fitsCta.getAttribute('href');
  expect(href).toContain('/collections/wheels');
  expect(href).toContain('bolt_pattern=5x114.3');
  // All three OEM diameters from the stub are present
  expect(href).toMatch(/rim_diameter=16/);
  expect(href).toMatch(/rim_diameter=17/);
  expect(href).toMatch(/rim_diameter=18/);
});

test('Diameter CTAs link to /collections/wheels?rim_diameter=<n>', async ({ page }) => {
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await page.locator('[data-smart-search-input]').first().fill('2020 Honda Civic');
  await page.locator('.hsf-wf').waitFor({ state: 'visible', timeout: 15000 });

  // 3 diameter CTAs (16", 17", 18")
  const ctas = page.locator('[data-wf-diameter]');
  await expect(ctas).toHaveCount(3);
  await expect(ctas.first()).toHaveAttribute('href', /\/collections\/wheels\?.*rim_diameter=16/);
  await expect(ctas.nth(1)).toHaveAttribute('href', /\/collections\/wheels\?.*rim_diameter=17/);
  await expect(ctas.nth(2)).toHaveAttribute('href', /\/collections\/wheels\?.*rim_diameter=18/);
});

test('OEM tire CTA links to /collections/tires with width + profile + rim filters', async ({ page }) => {
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await page.locator('[data-smart-search-input]').first().fill('2020 Honda Civic');
  await page.locator('.hsf-wf').waitFor({ state: 'visible', timeout: 15000 });

  const tireCta = page.locator('[data-wf-tire]').first();
  await expect(tireCta).toHaveAttribute('href', /\/collections\/tires\?.*tire_width=\d{3}.*tire_profile=\d{2}.*rim_diameter=\d{2}/);
});

test('Tires mode + vehicle → trim picker (no fitment card)', async ({ page }) => {
  // Default mode is tires; no need to toggle. Type vehicle.
  await page.locator('[data-smart-search-input]').first().fill('2020 Honda Civic');
  // Wait for either the trim picker, single resolved result, or guidance
  await page.locator('.hero-smart-search__trim-header, .hero-smart-search__result-item, .hero-smart-search__guidance').first().waitFor({ state: 'visible', timeout: 15000 });

  // The wheel fitment card must NOT render in tires mode
  await expect(page.locator('.hsf-wf')).toHaveCount(0);
});

test('Wheel fitment empty payload → graceful fallback card', async ({ page }) => {
  // Override the route to return a null payload (no fitment data)
  await page.route('**/api/wheel-fitment*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ vehicle: null }),
  }));
  await page.goto(BASE);
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await page.locator('[data-smart-search-input]').first().fill('1998 Yugo GV');
  // Fallback uses the existing __guidance--needs-trim card variant
  await page.locator('.hero-smart-search__guidance--needs-trim').waitFor({ state: 'visible', timeout: 15000 });
  await expect(page.locator('.hero-smart-search__guidance--needs-trim')).toContainText(/No wheel fitment data/i);
});

test('Mode toggle from Wheels → Tires after fitment card re-renders the tires flow', async ({ page }) => {
  await page.locator('[data-search-mode="wheels"][role="tab"]').click();
  await page.locator('[data-smart-search-input]').first().fill('2020 Honda Civic');
  await page.locator('.hsf-wf').waitFor({ state: 'visible', timeout: 15000 });

  // Click the Tires tab — should re-run the search in tires mode
  await page.locator('[data-search-mode="tires"][role="tab"]').click();
  await expect(page.locator('.hsf-wf')).toHaveCount(0);
  // Wait for some tires-mode UI to land (trim picker, result item, or guidance)
  await page.locator('.hero-smart-search__trim-header, .hero-smart-search__result-item, .hero-smart-search__guidance').first().waitFor({ state: 'visible', timeout: 15000 });
});
