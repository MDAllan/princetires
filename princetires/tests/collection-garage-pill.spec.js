// @ts-check
/**
 * My Garage chip (compact pill) acceptance tests.
 *
 * Run: npx playwright test tests/collection-garage-pill.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const COLLECTION = 'https://princetires.ca/collections/tires';

test.beforeEach(async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('pt-garage-')).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('pt-tire-search-vehicle');
  });
});

test('1. Guest with no saved vehicle sees the Sign-in chip', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  const pill = page.locator('[data-pt-gp]');
  await expect(pill).toBeVisible();
  // Sign-in chip is the visible link; has-chip is hidden
  await expect(page.locator('[data-pt-gp-signin]')).toBeVisible();
  await expect(page.locator('[data-pt-gp-signin]')).toHaveAttribute('href', /account/);
  await expect(page.locator('[data-pt-gp-chip-has]')).toBeHidden();
  await expect(page.locator('[data-pt-gp-add]')).toBeHidden();
});

test('2. Chip shows the saved tire-search vehicle, label is the make+model', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX',
      sizes: ['215/55R16']
    }));
  });
  await page.reload();
  await expect(page.locator('[data-pt-gp-chip-has]')).toBeVisible();
  await expect(page.locator('[data-pt-gp-chip-label]')).toContainText('Honda Civic');
  // Popover closed by default
  await expect(page.locator('[data-pt-gp-popover]')).toBeHidden();
});

test('3. Clicking the chip opens the popover; Apply navigates with the size as filter', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX',
      sizes: ['215/55R16']
    }));
  });
  await page.reload();
  await page.locator('[data-pt-gp-chip-has]').click();
  await expect(page.locator('[data-pt-gp-popover]')).toBeVisible();

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

test('4. Multiple saved cars all appear in the picker (default first)', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-garage-test', JSON.stringify([
      { year: 2018, make: 'Toyota', model: 'Camry', trim: 'LE', tireSize: '215/55R17', isDefault: false },
      { year: 2022, make: 'Honda', model: 'CR-V', trim: 'EX', tireSize: '235/65R18', isDefault: true }
    ]));
  });
  await page.reload();
  // Chip label shows the default vehicle (Honda CR-V)
  await expect(page.locator('[data-pt-gp-chip-label]')).toContainText('Honda CR-V');
  // Open popover, inspect options
  await page.locator('[data-pt-gp-chip-has]').click();
  const options = page.locator('[data-pt-gp-picker] option');
  await expect(options).toHaveCount(2);
  const first = await options.first().textContent();
  expect(first).toContain('2022 Honda CR-V');
});

test('5. Multi-car chip shows a +N badge', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-garage-test', JSON.stringify([
      { year: 2018, make: 'Toyota', model: 'Camry', trim: 'LE', tireSize: '215/55R17', isDefault: false },
      { year: 2022, make: 'Honda', model: 'CR-V', trim: 'EX', tireSize: '235/65R18', isDefault: true },
      { year: 2020, make: 'Ford', model: 'F-150', trim: 'XLT', tireSize: '275/55R20', isDefault: false }
    ]));
  });
  await page.reload();
  const badge = page.locator('[data-pt-gp-chip-badge]');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('+2');
});

test('6. Single-car chip hides the +N badge', async ({ page }) => {
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX', sizes: ['215/55R16']
    }));
  });
  await page.reload();
  const badge = page.locator('[data-pt-gp-chip-badge]');
  await expect(badge).toBeHidden();
});

test('7. Chip is compact on mobile (height ~26px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(COLLECTION + '?filter.p.vendor=Michelin');
  await page.evaluate(() => {
    localStorage.setItem('pt-tire-search-vehicle', JSON.stringify({
      year: '2020', make: 'Honda', model: 'Civic', trim: 'LX', sizes: ['215/55R16']
    }));
  });
  await page.reload();
  const chip = page.locator('[data-pt-gp-chip-has]');
  await expect(chip).toBeVisible();
  const box = await chip.boundingBox();
  expect(box.height).toBeLessThanOrEqual(32);
});
