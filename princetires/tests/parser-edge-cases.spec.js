// @ts-check
/**
 * Parser edge cases: verify the homepage smart-search recognizes
 * additional tire-size formats found in real inventory or commonly
 * typed by customers.
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

/**
 * Submit a query through the homepage smart-search and capture the
 * resulting redirect URL (or fallback state).
 */
async function searchAndCapture(page, query) {
  const targets = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/collections/tires')) targets.push(u);
  });
  // Block actual navigation so the test can read state
  await page.route('**/collections/tires*', route => route.fulfill({ status: 200, body: 'blocked' }));

  await page.goto(BASE);
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill(query);
  await input.press('Enter');
  // Give time for either navigation or fallback to render
  await page.waitForTimeout(1500);
  return targets;
}

test('1. ZRF run-flat: 205/55ZRF16 routes to collection', async ({ page }) => {
  const targets = await searchAndCapture(page, '205/55ZRF16');
  expect(targets.length, 'should attempt collection redirect').toBeGreaterThan(0);
  const url = targets[0];
  expect(url).toContain('tire_width=205');
  expect(url).toContain('tire_profile=55');
  expect(url).toContain('rim_diameter=16');
});

test('2. Euro-metric no-aspect: 145R12 routes to collection', async ({ page }) => {
  const targets = await searchAndCapture(page, '145R12');
  expect(targets.length, 'should attempt collection redirect').toBeGreaterThan(0);
  const url = targets[0];
  expect(url).toContain('tire_width=145');
  expect(url).toContain('rim_diameter=12');
  // aspect param should be absent (no aspect for Euro-metric)
  expect(url).not.toContain('tire_profile=&');
});

test('3. 8-digit compressed flotation: 33125020 normalizes to 33x12.50R20', async ({ page }) => {
  const targets = await searchAndCapture(page, '33125020');
  expect(targets.length, 'should attempt collection redirect').toBeGreaterThan(0);
  const url = targets[0];
  // Compressed 33125020 → OD=33, section width = 12.50, rim = 20
  // The route should NOT be 312/50R20 (the wrong mis-parse)
  expect(url).toContain('tire_width=33');
  expect(url).toContain('rim_diameter=20');
  expect(url).not.toContain('tire_width=312');
});

test('4. Standard format still works: 225/45R17', async ({ page }) => {
  const targets = await searchAndCapture(page, '225/45R17');
  expect(targets.length).toBeGreaterThan(0);
  expect(targets[0]).toContain('tire_width=225');
  expect(targets[0]).toContain('tire_profile=45');
  expect(targets[0]).toContain('rim_diameter=17');
});

test('5. Lowercase still works: 185/65r15', async ({ page }) => {
  const targets = await searchAndCapture(page, '185/65r15');
  expect(targets.length).toBeGreaterThan(0);
  expect(targets[0]).toContain('tire_width=185');
  expect(targets[0]).toContain('tire_profile=65');
  expect(targets[0]).toContain('rim_diameter=15');
});
