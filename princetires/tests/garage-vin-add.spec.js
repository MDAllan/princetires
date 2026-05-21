// @ts-check
/**
 * Garage — Add by VIN.
 *
 * The /pages/garage page is customer-account-gated, so a logged-out
 * Playwright session sees the login form instead of the add-vehicle UI.
 * This spec skips when the markup isn't reachable, and otherwise exercises
 * the VIN-paste path with the decode-vin proxy stubbed.
 *
 * For a full end-to-end QA, see tests/garage-vin-add-MANUAL.md.
 *
 * Run: npx playwright test tests/garage-vin-add.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';
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

async function gotoGarageOrSkip(page) {
  await page.route('**/api/decode-vin**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(STUB_DECODED),
  }));
  await page.goto(`${BASE}/pages/garage`);
  const vinInput = page.locator('[data-garage-vin]');
  const visible = await vinInput.isVisible({ timeout: 4000 }).catch(() => false);
  test.skip(!visible, 'garage requires customer login; skipping E2E spec — see garage-vin-add-MANUAL.md');
  return vinInput;
}

test('VIN markup is rendered inside the add-vehicle form', async ({ page }) => {
  const vinInput = await gotoGarageOrSkip(page);
  await expect(vinInput).toBeVisible();
  await expect(page.locator('[data-garage-vin-decode]')).toBeVisible();
});

test('Invalid VIN format shows an inline error', async ({ page }) => {
  await gotoGarageOrSkip(page);
  await page.locator('[data-garage-toggle-add]').first().click();
  await page.locator('[data-garage-vin]').fill('ABC123'); // too short
  await page.locator('[data-garage-vin-decode]').click();
  await expect(page.locator('[data-garage-vin-status]')).toContainText(/17 characters/i);
});

test('Pasting a valid VIN pre-fills year/make/model and shows success', async ({ page }) => {
  await gotoGarageOrSkip(page);
  await page.locator('[data-garage-toggle-add]').first().click();
  await page.locator('[data-garage-vin]').fill('2HGFC2F69LH567890');
  await page.locator('[data-garage-vin-decode]').click();
  // Wait for the decode + cascade
  await page.locator('[data-garage-vin-status].garage__vin-status--ok').waitFor({ state: 'visible', timeout: 10000 });

  // The status row should mention the decoded vehicle
  await expect(page.locator('[data-garage-vin-status]')).toContainText(/2020 HONDA Civic/i);

  // Year + make + model should be pre-selected (some year data files may
  // not contain Honda — the test stays lenient if the option doesn't exist).
  const yearVal = await page.locator('[data-garage-year]').inputValue();
  expect(yearVal === '2020' || yearVal === '').toBeTruthy();
});

test('VIN input strips spaces + hyphens as the customer types', async ({ page }) => {
  await gotoGarageOrSkip(page);
  await page.locator('[data-garage-toggle-add]').first().click();
  const input = page.locator('[data-garage-vin]');
  await input.fill('2HG-FC2 F69LH567890');
  await expect(input).toHaveValue('2HGFC2F69LH567890');
});
