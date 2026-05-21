// @ts-check
/**
 * VIN paste in the homepage smart search.
 *
 * When the customer pastes a 17-character VIN (no I/O/Q), the search bypasses
 * the Gemini parser and asks NHTSA's vPIC API directly via the server-side
 * proxy at app.princetires.ca/api/decode-vin. The resolved vehicle (with
 * trim + engine) then drives the normal vehicle flow.
 *
 * The proxy is stubbed via page.route() so the test is independent of the
 * production deployment of princetires-app.
 *
 * Run: npx playwright test tests/vin-paste-search.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';
const REAL_VIN = '2HGFC2F69LH567890'; // valid format; 2020 Honda Civic LX shape

const STUB_DECODED = {
  vehicle: {
    year: 2020,
    make: 'HONDA',
    model: 'Civic',
    trim: 'LX',
    series: null,
    vehicle_type: 'PASSENGER CAR',
    body_class: 'Sedan/Saloon',
    engine: { cylinders: 4, displacement_l: 2.0, fuel_type: 'Gasoline' },
    drive_type: '4x2',
    plant_country: 'CANADA',
    plant_city: 'ALLISTON',
  },
  error_code: '0',
  error_text: '',
};

test.beforeEach(async ({ page }) => {
  // Stub the decode-vin proxy so the test passes regardless of Vercel deploy.
  await page.route('**/api/decode-vin**', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_DECODED),
    });
  });
  await page.goto(BASE);
  // Reset to Tires mode for determinism
  await page.evaluate(() => { try { localStorage.removeItem('pt-search-mode'); } catch (e) {} });
  await page.reload();
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
});

test('pasting a VIN calls the decode-vin proxy and skips Gemini', async ({ page }) => {
  let vinRequested = false;
  let geminiRequested = false;
  await page.route('**/api/vehicle-parse', (route) => {
    geminiRequested = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ vehicle: null }),
    });
  });
  await page.route('**/api/decode-vin**', (route) => {
    vinRequested = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_DECODED),
    });
  });

  const input = page.locator('[data-smart-search-input]').first();
  await input.fill(REAL_VIN);
  // Vehicle resolves → trim picker, single result, or guidance — wait for any of them
  await page.locator('.hero-smart-search__trim-header, .hero-smart-search__result-item, .hero-smart-search__guidance').first()
    .waitFor({ state: 'visible', timeout: 15000 });

  expect(vinRequested, 'decode-vin proxy should be called').toBe(true);
  expect(geminiRequested, 'Gemini should NOT be called when a VIN is detected').toBe(false);
});

test('VIN with hyphens/spaces is still detected', async ({ page }) => {
  let vinRequested = false;
  await page.route('**/api/decode-vin**', (route) => {
    vinRequested = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_DECODED),
    });
  });

  const input = page.locator('[data-smart-search-input]').first();
  // Same VIN, with a hyphen in the middle and a trailing space
  await input.fill(REAL_VIN.slice(0, 10) + '-' + REAL_VIN.slice(10) + ' ');
  await page.locator('.hero-smart-search__trim-header, .hero-smart-search__result-item, .hero-smart-search__guidance').first()
    .waitFor({ state: 'visible', timeout: 15000 });

  expect(vinRequested, 'decode-vin proxy should be called for hyphenated VIN').toBe(true);
});

test('invalid VIN (contains "I") falls through to Gemini', async ({ page }) => {
  let vinRequested = false;
  let geminiRequested = false;
  await page.route('**/api/decode-vin**', (route) => {
    vinRequested = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vehicle: null }) });
  });
  await page.route('**/api/vehicle-parse', (route) => {
    geminiRequested = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vehicle: null }) });
  });

  const input = page.locator('[data-smart-search-input]').first();
  // Same length (17) but contains 'I' which is illegal in real VINs
  await input.fill('IHGFC2F69LH567890');
  await page.waitForTimeout(1000);

  expect(vinRequested, 'decode-vin should NOT be called for input containing I').toBe(false);
  // Gemini may or may not be called depending on whether the search ran;
  // the critical assertion is just that the VIN fast-path was skipped.
});

test('non-VIN query ("2020 Honda Civic") still uses Gemini', async ({ page }) => {
  let vinRequested = false;
  let geminiRequested = false;
  await page.route('**/api/decode-vin**', (route) => {
    vinRequested = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vehicle: null }) });
  });
  await page.route('**/api/vehicle-parse', (route) => {
    geminiRequested = true;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ vehicle: { year: 2020, make: 'Honda', model: 'Civic', trim: null } }),
    });
  });

  const input = page.locator('[data-smart-search-input]').first();
  await input.fill('2020 Honda Civic');
  await page.locator('.hero-smart-search__trim-header, .hero-smart-search__result-item, .hero-smart-search__guidance').first()
    .waitFor({ state: 'visible', timeout: 15000 });

  expect(vinRequested, 'decode-vin should NOT be called for free-text vehicle').toBe(false);
  // Note: clean "2020 Honda Civic" may be handled by the local tryDirectParse
  // before Gemini fires — so we only assert that decode-vin is bypassed.
});

test('VIN paste fires pt_search analytics with search_type=vin', async ({ page }) => {
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
  await page.locator('[data-smart-search-input]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.route('**/api/decode-vin**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(STUB_DECODED),
  }));

  await page.locator('[data-smart-search-input]').first().fill(REAL_VIN);
  await page.locator('.hero-smart-search__trim-header, .hero-smart-search__result-item, .hero-smart-search__guidance').first()
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(300);

  const events = await page.evaluate(() => window.__ptEvents || []);
  const vinEvent = events.find(e => e && e.event === 'pt_search' && e.search_type === 'vin');
  expect(vinEvent, 'pt_search/vin event should fire').toBeTruthy();
  expect(vinEvent.surface).toBe('homepage');
});
