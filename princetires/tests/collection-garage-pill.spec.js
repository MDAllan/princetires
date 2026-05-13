// @ts-check
/**
 * My Garage pill acceptance tests.
 *
 * Run: npx playwright test tests/collection-garage-pill.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test.beforeEach(async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    // Drop every garage / search-vehicle entry so each test seeds its own state
    Object.keys(localStorage).filter(k => k.startsWith('pt-garage-')).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('pt-tire-search-vehicle');
  });
});

test('1. Guest with no saved vehicle sees the sign-in CTA', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  const pill = page.locator('[data-pt-gp]');
  await expect(pill).toBeVisible();
  await expect(page.locator('[data-pt-gp-signin]')).toBeVisible();
  await expect(page.locator('[data-pt-gp-signin] a')).toHaveAttribute('href', /account/);
  await expect(page.locator('[data-pt-gp-has]')).toBeHidden();
});

test('2. Pill shows the saved tire-search vehicle (anonymous user)', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX',
      sizes: ['215/55R16'],
      savedAt: '2026-01-01T00:00:00.000Z'
    }));
  });
  // Reload to let the pill JS pick up the new localStorage value
  await page.reload();
  const pill = page.locator('[data-pt-gp]');
  await expect(pill).toBeVisible();
  const opt = await page.locator('[data-pt-gp-picker] option').first().textContent();
  expect(opt).toContain('2020 Honda Civic');
  expect(opt).toContain('215/55R16');
});

test('3. Clicking Apply applies the saved size as filter + keeps vendor', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX',
      sizes: ['215/55R16']
    }));
  });
  await page.reload();
  await Promise.all([
    page.waitForURL(/tire_width=215/, { timeout: 5000 }),
    page.locator('[data-pt-gp-apply]').click()
  ]);
  const url = page.url();
  expect(url).toContain('filter.p.m.custom.tire_width=215');
  expect(url).toContain('filter.p.m.custom.tire_profile=55');
  expect(url).toContain('filter.p.m.custom.rim_diameter=16');
  expect(url).toContain('filter.p.vendor=Michelin');
});

test('4. Multiple saved garage cars all appear in the picker, default first', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-garage-test-customer', JSON.stringify([
      { year: 2018, make: 'Toyota', model: 'Camry', trim: 'LE', tireSize: '215/55R17', isDefault: false },
      { year: 2022, make: 'Honda', model: 'CR-V', trim: 'EX', tireSize: '235/65R18', isDefault: true }
    ]));
  });
  await page.reload();
  const options = page.locator('[data-pt-gp-picker] option');
  await expect(options).toHaveCount(2);
  // Default vehicle should be first
  const first = await options.first().textContent();
  expect(first).toContain('2022 Honda CR-V');
  const second = await options.nth(1).textContent();
  expect(second).toContain('2018 Toyota Camry');
});

test('5. Saved vehicle with no size falls back to the sign-in CTA (guest)', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX', sizes: []
    }));
  });
  await page.reload();
  // No usable size → CTA falls back. As a guest we see the sign-in option.
  await expect(page.locator('[data-pt-gp-signin]')).toBeVisible();
  await expect(page.locator('[data-pt-gp-has]')).toBeHidden();
});
