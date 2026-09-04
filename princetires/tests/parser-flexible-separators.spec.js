// @ts-check
/**
 * Verify the shared PTTireParse module:
 *  - parseBoltPattern accepts every common separator (x X × ✕ * -) and
 *    snaps imprecise customer-typed values to the nearest catalog
 *    canonical within 1.5 mm tolerance.
 *  - parseSize accepts the same separator flexibility for spaced tire
 *    sizes (e.g. "225-55-17", "225*55*17", "225 55 17").
 *
 * Run: npx playwright test tests/parser-flexible-separators.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.waitForFunction(() => typeof window.PTTireParse !== 'undefined', { timeout: 15000 });
});

test('parseBoltPattern: "5x114" snaps to canonical "5x114.3"', async ({ page }) => {
  const result = await page.evaluate(() => window.PTTireParse.parseBoltPattern('5x114'));
  expect(result).toBe('5x114.3');
});

test('parseBoltPattern: "5X114" (uppercase) → "5x114.3"', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('5X114'))).toBe('5x114.3');
});

test('parseBoltPattern: "5×114" (unicode × multiplication) → "5x114.3"', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('5×114'))).toBe('5x114.3');
});

test('parseBoltPattern: "5*114" (asterisk) → "5x114.3"', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('5*114'))).toBe('5x114.3');
});

test('parseBoltPattern: "5-114" (hyphen) → "5x114.3"', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('5-114'))).toBe('5x114.3');
});

test('parseBoltPattern: "5x4.5" (inch) → "5x114.3" (mm canonical)', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('5x4.5'))).toBe('5x114.3');
});

test('parseBoltPattern: "6x139" snaps to "6x139.7"', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('6x139'))).toBe('6x139.7');
});

test('parseBoltPattern: "8x165" snaps to "8x165.1"', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('8x165'))).toBe('8x165.1');
});

test('parseBoltPattern: exact catalog value "5x100" stays "5x100"', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('5x100'))).toBe('5x100');
});

test('parseBoltPattern: far-off value ("5x95") returns the literal (no snap beyond 1.5mm)', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('5x95'))).toBe('5x95');
});

test('parseBoltPattern: non-bolt-pattern shape returns null', async ({ page }) => {
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('hello'))).toBeNull();
  expect(await page.evaluate(() => window.PTTireParse.parseBoltPattern('225/65R17'))).toBeNull();
});

test('parseSize: "225-55-17" (hyphen separator) parses like the slash form', async ({ page }) => {
  const r = await page.evaluate(() => window.PTTireParse.parseSize('225-55-17'));
  expect(r).not.toBeNull();
  expect(r.canonical).toBe('225/55R17');
});

test('parseSize: "225*55*17" (asterisk separator) parses correctly', async ({ page }) => {
  const r = await page.evaluate(() => window.PTTireParse.parseSize('225*55*17'));
  expect(r).not.toBeNull();
  expect(r.canonical).toBe('225/55R17');
});

test('parseSize: "225 55 17" (spaces — pre-existing) still works', async ({ page }) => {
  const r = await page.evaluate(() => window.PTTireParse.parseSize('225 55 17'));
  expect(r).not.toBeNull();
  expect(r.canonical).toBe('225/55R17');
});
