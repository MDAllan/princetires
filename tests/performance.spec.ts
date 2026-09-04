import { test, chromium, expect } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';

/**
 * Lighthouse performance + accessibility audits via playwright-lighthouse.
 *
 * Lighthouse only runs on Chromium, so these tests are skipped on the Firefox
 * and WebKit projects. Each audit launches its OWN Chromium on a unique
 * remote-debugging port and runs independently — so a single flaky audit never
 * blocks the others (Lighthouse scores are sensitive to machine load).
 *
 * Thresholds (per request): performance >= 70, accessibility >= 90.
 */
const BASE = 'https://princetires.ca';
const thresholds = { performance: 70, accessibility: 90 };

test.describe('Lighthouse audits', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Lighthouse runs on Chromium only');

  // Lighthouse audits are slow — give each a generous budget.
  test.setTimeout(180_000);

  /** Launch a dedicated Chromium on `port`, audit `url`, then tear it down. */
  async function auditUrl(url: string, port: number) {
    const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'load' });
      await playAudit({
        page,
        port,
        thresholds,
        reports: { formats: { html: false } },
      });
    } finally {
      await browser.close();
    }
  }

  /** Resolve a real product URL via the search results page. */
  async function resolveProductUrl(port: number): Promise<string> {
    const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
    try {
      const page = await browser.newPage();
      await page.goto(`${BASE}/search?q=tire`, { waitUntil: 'domcontentloaded' });
      const href = await page.locator('a[href*="/products/"]').first().getAttribute('href');
      return href ? new URL(href.split('?')[0], BASE).toString() : `${BASE}/collections/all`;
    } finally {
      await browser.close();
    }
  }

  test('homepage meets performance & accessibility thresholds', async () => {
    await auditUrl(`${BASE}/`, 9222);
  });

  test('product page meets performance & accessibility thresholds', async () => {
    const productUrl = await resolveProductUrl(9223);
    expect(productUrl, 'a product URL should have been resolved').toBeTruthy();
    await auditUrl(productUrl, 9223);
  });

  test('contact page meets performance & accessibility thresholds', async () => {
    await auditUrl(`${BASE}/pages/contact`, 9224);
  });
});
