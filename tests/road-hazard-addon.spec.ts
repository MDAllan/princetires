import { test, expect, Page } from '@playwright/test';

/**
 * Road Hazard Protection booking add-on (live site).
 *
 * When a customer books a tire, the product booking modal
 * (snippets/pt-booking-modal.liquid) offers "Road Hazard Protection" — a
 * per-tire add-on sold as 1/2/3-year plans, each priced as a % of the tire
 * price with a per-tire floor/cap. A coverage-term dropdown lets the customer
 * pick; the price + order line update to the chosen term, and it rolls into the
 * total.
 *
 * Assertions are tire-price-agnostic: we read the tire's own price off the
 * booking trigger and compute the expected charge per term. If the rates change,
 * update TERMS below to match db/036-road-hazard-terms.sql.
 */

const TERMS: Record<number, { percent: number; min: number; max: number }> = {
  12: { percent: 10, min: 12, max: 50 },
  24: { percent: 15, min: 15, max: 70 },
  36: { percent: 20, min: 20, max: 90 },
};
const DEFAULT_MONTHS = 36;

/** Mirror the theme's per-tire price + label formatting exactly. */
function expectedUnit(tirePrice: number, months: number): number {
  const t = TERMS[months];
  const raw = (tirePrice * t.percent) / 100;
  return Math.min(t.max, Math.max(t.min, raw));
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
  test('offers 1/2/3-year terms, reprices on term change, and rolls into the total', async ({
    page,
  }) => {
    const { priceCents } = await findBookableTire(page);
    const tirePrice = priceCents / 100;

    // Open the booking modal from the PDP.
    const bookBtn = page.locator('[onclick*="openBookingModal"][data-tire-price]').first();
    await bookBtn.scrollIntoViewIfNeeded();
    await bookBtn.click();

    // The add-on renders after the modal's /api/services fetch resolves.
    const row = page
      .locator('#bk-custom-addons .bk-addon')
      .filter({ hasText: 'Road Hazard Protection' });
    await expect(row).toBeVisible({ timeout: 15_000 });

    const priceLabel = row.locator('.bk-addon-price');
    const termSelect = row.locator('select.bk-addon-term');

    // Default term (3-year) price is shown, and all three terms are selectable.
    await expect(priceLabel).toHaveText(`+$${fmtUnit(expectedUnit(tirePrice, DEFAULT_MONTHS))}/tire`);
    await expect(termSelect.locator('option')).toHaveCount(3);

    // "What's covered?" links to the details page.
    await expect(row.locator('a.bk-addon-info')).toHaveAttribute(
      'href',
      '/pages/road-hazard-protection',
    );

    // Switching to the 1-year term reprices the row live.
    await termSelect.selectOption('12');
    await expect(priceLabel).toHaveText(`+$${fmtUnit(expectedUnit(tirePrice, 12))}/tire`);

    // Ticking it (at the 1-year term) adds a matching, term-labelled order line
    // and lifts the total.
    const totalRow = page.locator('#bk-order-total-row');
    const num = (s: string) => parseFloat(s.replace(/[^\d.]/g, ''));
    const totalBefore = num(await totalRow.innerText());

    await row.locator('input[type="checkbox"]').check();

    const orderLines = page.locator('#bk-order-lines');
    await expect(orderLines).toContainText('Road Hazard Protection (1 year)');
    const lineText = await orderLines.innerText();
    const m = lineText.match(/Road Hazard Protection \(1 year\) × (\d+)\s*\+\$([\d.]+)/);
    expect(m, `road-hazard order line not found in:\n${lineText}`).toBeTruthy();
    const qty = parseInt(m![1], 10);
    expect(m![2]).toBe((expectedUnit(tirePrice, 12) * qty).toFixed(2));

    expect(num(await totalRow.innerText())).toBeGreaterThan(totalBefore);
  });
});
