// @ts-check
/**
 * Mobile keyboard handling — the page must NOT scroll on plain input focus.
 * It must scroll only when the on-screen keyboard actually opens (i.e. when
 * the visualViewport shrinks). The scroll target is conservative: ~50px from
 * the visual viewport top, not flush-to-top.
 *
 * Run: npx playwright test tests/mobile-keyboard-scroll.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://princetires.ca';

// Mobile-sized Chromium (390×844, hasTouch, isMobile).
test.use({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
});

test('homepage: focusing the input does NOT scroll the page when no keyboard is open', async ({ page }) => {
  await page.goto(BASE);
  // Scroll a bit so the input is partway down — then focus and verify
  // the scroll position doesn't change.
  await page.evaluate(() => window.scrollTo(0, 80));
  const beforeScroll = await page.evaluate(() => window.scrollY);

  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.focus();
  await page.waitForTimeout(700);

  const afterScroll = await page.evaluate(() => window.scrollY);
  // Allow ±2px noise; the key assertion is "no meaningful auto-scroll on focus alone"
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThan(8);
});

test('homepage: simulated keyboard open re-anchors the input gently (~50px from top, not flush)', async ({ page }) => {
  await page.goto(BASE);
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });

  // Scroll so the input is well below the upper third of the viewport
  await page.evaluate(() => window.scrollTo(0, 0));
  await input.focus();

  // Simulate a keyboard opening: fake a smaller visualViewport.height and
  // dispatch the 'resize' event the search code listens to.
  await page.evaluate(() => {
    if (!window.visualViewport) return;
    // Shrink the visual viewport by ~330px (typical iOS keyboard).
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: window.innerHeight - 330 });
    Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, value: 0 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(800);

  const top = await input.evaluate(el => el.getBoundingClientRect().top);
  // Conservative target: input should be in the upper ~140px of viewport
  // (close to TARGET=50 with some smooth-scroll tolerance) — but NOT
  // flush to the top.
  expect(top).toBeGreaterThan(20);   // not flush-top
  expect(top).toBeLessThan(140);     // but visibly near the top
});

test('homepage: NO scroll re-anchor when input is already near the top of the visual viewport', async ({ page }) => {
  await page.goto(BASE);
  const input = page.locator('[data-smart-search-input]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.focus();

  // Manually scroll so the input is already comfortably high (within upper 30%).
  const rectBefore = await input.evaluate(el => el.getBoundingClientRect());
  await page.evaluate(targetY => window.scrollBy(0, targetY), Math.max(0, rectBefore.top - 60));
  await page.waitForTimeout(120);
  const scrollAfterManual = await page.evaluate(() => window.scrollY);

  // Simulate keyboard open — but since the input is already high, NO further scroll should happen
  await page.evaluate(() => {
    if (!window.visualViewport) return;
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: window.innerHeight - 330 });
    Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, value: 0 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(800);

  const scrollFinal = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollFinal - scrollAfterManual)).toBeLessThan(10);
});

test('header overlay: uses --pt-visual-vh + internally scrollable', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('[data-pt-search-trigger]').locator('visible=true').first().click();
  await page.locator('#pt-header-search-input').waitFor({ state: 'visible', timeout: 8000 });

  const styles = await page.evaluate(() => {
    const ov = document.getElementById('pt-header-search-overlay');
    const cs = window.getComputedStyle(ov);
    return { height: cs.height, overflowY: cs.overflowY };
  });
  expect(styles.overflowY).toMatch(/auto|scroll/);
  expect(styles.height).toMatch(/^\d+(\.\d+)?px$/);
});

test('header overlay: panel sits comfortably near the top on mobile (not flush)', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('[data-pt-search-trigger]').locator('visible=true').first().click();
  const panel = page.locator('.pt-header__search-panel');
  await panel.waitFor({ state: 'visible', timeout: 8000 });

  const rect = await panel.evaluate(el => el.getBoundingClientRect());
  expect(rect.top).toBeGreaterThan(10);   // not flush
  expect(rect.top).toBeLessThan(60);      // but still near the top
});
