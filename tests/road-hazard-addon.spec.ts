import { test, expect, Page } from '@playwright/test';

/**
 * Road Hazard Protection booking add-on (live site).
 *
 * When a customer books a tire, the product booking modal
 * (snippets/pt-booking-modal.liquid) offers "Road Hazard Protection" — a
 * per-tire add-on priced at 15% of the tire price, floored at $15 and capped
 * at $60. It rolls into the order total and links to the details page.
 *
 * These assertions are price-agnostic: we read the tire's own price off the
 * booking trigger and compute the expected add-on charge, so the test keeps
 * passing when catalog prices change. If the % / floor / cap themselves change,
 * update ROAD_HAZARD below to match db/035-road-hazard-addon.sql.
 */

const ROAD_HAZARD = { percent: 15, min: 15, max: 60 } as const;

/** Mirror the theme's per-tire price + label formatting exactly. */
function expectedUnit(tirePrice: number): number {
  const raw = (tirePrice * ROAD_HAZARD.percent) / 100;
  return Math.min(ROAD_HAZARD.max, Math.max(ROAD_HAZARD.min, raw));
}
function fmtUnit(amt: number): string {
  // bkRenderCustomAddons: whole numbers drop the decimals, else 2dp.
  return amt % 1 === 0 ? amt.toFixed(0) : amt.toFixed(2);
}

/**
 * Find a published tire product whose PDP carries the booking trigger with a
 * real price. Walks the first several search results so the test doesn't hinge
 * on any one product's stock/availability.
 */
async function findBookableTire(
  page: Page,
): Promise<{ url: string; priceCents: number }> {
  await page.goto('/search?q=tire', { waitUntil: 'domcontentloaded' });
  const hrefs: string[] = await page
    .locator('a[href*="/products/"]')
    .evaluateAll((els) =>
      Array.from(
        new Set(
          els
            .map((e) => (e as HTMLAnchorElement).getAttribute('href'))
            .filter((h): h is string => !!h)
            .map((h) => h.split('?')[0]),
        ),
      ),
    );

  for (const href of hrefs.slice(0, 8)) {
    await page.goto(href, { waitUntil: 'domcontentloaded' });
    const btn = page.locator('[onclick*="openBookingModal"][data-tire-price]').first();
    if ((await btn.count()) === 0) continue;
    const cents = parseInt((await btn.getAttribute('data-tire-price')) || '0', 10);
    if (cents > 0) return { url: href, priceCents: cents };
  }
  throw new Error('No bookable tire product with a price found in search results');
}

test.describe('Road Hazard Protection add-on', () => {
  test('appears in the tire booking modal, priced at 15% (floor $15 / cap $60), and rolls into the total', async ({
    page,
  }) => {
    const { priceCents } = await findBookableTire(page);
    const tirePrice = priceCents / 100;
    const unit = expectedUnit(tirePrice);

    // Open the booking modal from the PDP.
    const bookBtn = page.locator('[onclick*="openBookingModal"][data-tire-price]').first();
    await bookBtn.scrollIntoViewIfNeeded();
    await bookBtn.click();

    // The add-on renders after the modal's /api/services fetch resolves.
    const row = page
      .locator('#bk-custom-addons .bk-addon')
      .filter({ hasText: 'Road Hazard Protection' });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Price label matches the computed per-tire charge.
    await expect(row.locator('.bk-addon-price')).toHaveText(`+$${fmtUnit(unit)}/tire`);

    // "What's covered?" links to the details page.
    await expect(row.locator('a.bk-addon-info')).toHaveAttribute(
      'href',
      '/pages/road-hazard-protection',
    );

    // Ticking it adds a matching line to the order breakdown and lifts the total.
    const totalRow = page.locator('#bk-order-total-row');
    const totalBefore = await totalRow.innerText();

    await row.locator('input[type="checkbox"]').check();

    // The order line reads "Road Hazard Protection × <qty>  +$<unit*qty>".
    const orderLines = page.locator('#bk-order-lines');
    await expect(orderLines).toContainText('Road Hazard Protection');
    const lineText = await orderLines.innerText();
    const m = lineText.match(/Road Hazard Protection × (\d+)\s*\+\$([\d.]+)/);
    expect(m, `road-hazard order line not found in:\n${lineText}`).toBeTruthy();
    const qty = parseInt(m![1], 10);
    expect(m![2]).toBe((unit * qty).toFixed(2));

    // Total must strictly increase after adding the paid add-on.
    const totalAfter = await totalRow.innerText();
    const num = (s: string) => parseFloat(s.replace(/[^\d.]/g, ''));
    expect(num(totalAfter)).toBeGreaterThan(num(totalBefore));
  });
});
