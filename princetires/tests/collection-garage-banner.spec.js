// @ts-check
/**
 * Saved-car banner — appears at top of /collections/tires when:
 *   - customer has at least one saved car
 *   - URL has no tire-size filter
 *   - banner wasn't dismissed this session
 *
 * Run: npx playwright test tests/collection-garage-banner.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test.beforeEach(async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('pt-garage-')).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('pt-tire-search-vehicle');
    sessionStorage.removeItem('ptg_garage_banner_dismissed');
  });
});

test('1. Banner hidden when no saved vehicle', async ({ page }) => {
  await page.goto(COLLECTION);
  await expect(page.locator('[data-pt-gb]')).toBeHidden();
});

test('2. Banner hidden when URL already has size filter', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', sizes: ['215/55R16']
    }));
  });
  await page.goto(COLLECTION + '?filter.p.m.custom.tire_width=225&filter.p.m.custom.tire_profile=45&filter.p.m.custom.rim_diameter=17');
  await expect(page.locator('[data-pt-gb]')).toBeHidden();
});

test('3. Single saved car → banner shows name + size + Yes/No buttons', async ({ page }) => {
  await page.goto(COLLECTION);
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX',
      sizes: ['215/55R16']
    }));
  });
  await page.reload();
  const banner = page.locator('[data-pt-gb]');
  await expect(banner).toBeVisible();
  await expect(page.locator('[data-pt-gb-single]')).toBeVisible();
  await expect(page.locator('[data-pt-gb-name]')).toContainText('2020 Honda Civic');
  await expect(page.locator('[data-pt-gb-size]')).toContainText('215/55R16');
  await expect(page.locator('[data-pt-gb-yes]')).toBeVisible();
  await expect(page.locator('[data-pt-gb-no]')).toBeVisible();
});

test('4. Yes button applies the size as filter', async ({ page }) => {
  await page.goto(COLLECTION);
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', sizes: ['215/55R16']
    }));
  });
  await page.reload();
  await Promise.all([
    page.waitForURL(/tire_width=215/, { timeout: 5000 }),
    page.locator('[data-pt-gb-yes]').click()
  ]);
  const url = page.url();
  expect(url).toContain('filter.p.m.custom.tire_width=215');
  expect(url).toContain('filter.p.m.custom.tire_profile=55');
  expect(url).toContain('filter.p.m.custom.rim_diameter=16');
});

test('5. Browse-all dismisses the banner and sets sessionStorage marker', async ({ page }) => {
  await page.goto(COLLECTION);
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', sizes: ['215/55R16']
    }));
  });
  await page.reload();
  await expect(page.locator('[data-pt-gb]')).toBeVisible();
  await page.locator('[data-pt-gb-no]').click();
  await expect(page.locator('[data-pt-gb]')).toBeHidden();
  // Marker is set
  const marker = await page.evaluate(() => sessionStorage.getItem('ptg_garage_banner_dismissed'));
  expect(marker).toBe('1');
  // Reload — banner should stay hidden
  await page.reload();
  await expect(page.locator('[data-pt-gb]')).toBeHidden();
});

test('6. Multi-car → banner shows picker, applies the selected car', async ({ page }) => {
  await page.goto(COLLECTION);
  await page.evaluate(() => {
    localStorage.setItem('pt-garage-test', JSON.stringify([
      { year: 2018, make: 'Toyota', model: 'Camry', tireSize: '215/55R17', isDefault: false },
      { year: 2022, make: 'Honda', model: 'CR-V', tireSize: '235/65R18', isDefault: true }
    ]));
  });
  await page.reload();
  await expect(page.locator('[data-pt-gb-multi]')).toBeVisible();
  const opts = page.locator('[data-pt-gb-picker] option');
  await expect(opts).toHaveCount(2);
  // Default (CR-V) first
  expect(await opts.first().textContent()).toContain('2022 Honda CR-V');
  // Pick the Camry, click Yes
  await page.locator('[data-pt-gb-picker]').selectOption({ index: 1 });
  await Promise.all([
    page.waitForURL(/tire_width=215/, { timeout: 5000 }),
    page.locator('[data-pt-gb-yes]').click()
  ]);
  const url = page.url();
  expect(url).toContain('filter.p.m.custom.tire_width=215');
  expect(url).toContain('filter.p.m.custom.tire_profile=55');
  expect(url).toContain('filter.p.m.custom.rim_diameter=17');
});
