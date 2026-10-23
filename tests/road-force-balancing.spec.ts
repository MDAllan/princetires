import { test, expect } from '@playwright/test';

/**
 * Road force balancing (live site) — Edmonton Trail NE only.
 *
 * The service lives in the catalog (GET /api/services, `locations: ["ne"]`) and
 * the storefront narrows its location picker to Edmonton Trail whenever it is
 * chosen. These checks pin the three places a customer meets it:
 *
 *   1. the service page exists and its CTA deep-links the booking page with
 *      the service slug (the one rule that keeps breaking — see the booking skill)
 *   2. /pages/booking?service=road_force_balancing pre-selects the tile, shows
 *      the "Edmonton Trail NE only" badge, and offers ONLY the NE location card
 *   3. picking a plain service again (balancing) restores both location cards
 *
 * If the shop names change, update NE_NAME / SW_NAME. If NE stops being
 * bookable online, test 2 expects the note instead of a card.
 */

const SERVICE_PAGE = '/pages/road-force-balancing';
const BOOKING_DEEP_LINK = '/pages/booking?service=road_force_balancing';
const NE_NAME = /Edmonton Trail/i;
const SW_NAME = /42 Ave/i;

test.describe('Road force balancing — NE only', () => {
  test('service page loads and books with the service slug', async ({ page }) => {
    const res = await page.goto(SERVICE_PAGE, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'service page should exist (create the Shopify Page with db/create-service-pages.mjs)').toBeLessThan(400);
    await expect(page.locator('h1')).toContainText(/road force balancing/i);
    // Every "Book …" CTA carries ?service=road_force_balancing.
    const ctas = page.locator('a.cgs__btn--primary');
    const n = await ctas.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(ctas.nth(i)).toHaveAttribute('href', /service=road_force_balancing/);
    }
    // The page says which shop, and it is the NE one.
    await expect(page.locator('.cgs__address')).toContainText(/Edmonton Trail/i);
  });

  test('booking page deep link pre-selects the tile and pins the shop to Edmonton Trail', async ({ page }) => {
    await page.goto(BOOKING_DEEP_LINK, { waitUntil: 'domcontentloaded' });
    const tile = page.locator('.bp-other-chip[data-bp-svc="road_force_balancing"]');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await expect(tile).toHaveClass(/bp-other-chip--active/);
    await expect(tile.locator('.bp-other-chip__badge')).toContainText(/Edmonton Trail/i);
    // Next is enabled straight from the deep link.
    await expect(page.locator('#bp-next-1')).toBeEnabled();

    // Location picker: only the NE card, plus the note saying why.
    const loc = page.locator('#bp-loc');
    await expect(loc).toBeVisible();
    const cards = loc.locator('.bp-loc-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(NE_NAME);
    await expect(cards.first()).toHaveClass(/bp-loc-card--active/);
    await expect(page.locator('#bp-loc-note')).toContainText(/only available at our Edmonton Trail/i);
  });

  test('the road force upgrade is offered on a non-install job and pins the shop when ticked', async ({ page }) => {
    await page.goto('/pages/booking?service=rotation', { waitUntil: 'domcontentloaded' });
    const loc = page.locator('#bp-loc');
    await expect(loc.locator('.bp-loc-card')).toHaveCount(2, { timeout: 15_000 });
    await page.locator('#bp-next-1').click();
    const row = page.locator('#bp-addons .bk-addon').filter({ hasText: /road force/i });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator('.bk-addon-note')).toContainText(NE_NAME);
    // Tick via the real change event (checkbox-in-<label> click double-toggles).
    await row.locator('input[type="checkbox"]').evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(loc.locator('.bp-loc-card')).toHaveCount(1);
    await expect(loc.locator('.bp-loc-card').first()).toContainText(NE_NAME);
    await expect(page.locator('#bp-loc-note')).toContainText(/only available at our Edmonton Trail/i);
    await expect(page.locator('#bp-price-note')).toContainText(/road force/i);
  });

  test('switching back to a plain service restores both shops', async ({ page }) => {
    await page.goto(BOOKING_DEEP_LINK, { waitUntil: 'domcontentloaded' });
    const loc = page.locator('#bp-loc');
    await expect(loc.locator('.bp-loc-card')).toHaveCount(1, { timeout: 15_000 });
    await page.locator('.bp-other-chip[data-bp-svc="balancing"]').click();
    const cards = loc.locator('.bp-loc-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: SW_NAME })).toHaveCount(1);
    await expect(cards.filter({ hasText: NE_NAME })).toHaveCount(1);
    await expect(page.locator('#bp-loc-note')).toBeHidden();
  });
});
