import { test, expect, Page } from '@playwright/test';

/**
 * Protection Plan booking add-on (live site) — formerly "Road Hazard Protection".
 *
 * When a customer books a tire install, the product booking modal offers the
 * Protection Plan as a 1/2/3-year add-on (% of tire price, floored/capped). It
 * is BRAND-GATED: it only appears on tires whose brand is on the admin allowlist
 * (Kumho / Rotalla / Radar to start), and is hidden on every other brand.
 *
 * Assertions are tire-price-agnostic. If the rates change, update TERMS to match
 * db/036; if the allowlist changes, update ALLOWED / A_NON_ALLOWED below.
 */

const TERMS: Record<number, { percent: number; min: number; max: number }> = {
  12: { percent: 10, min: 12, max: 50 },
  24: { percent: 15, min: 15, max: 70 },
  36: { percent: 20, min: 20, max: 90 },
};
const DEFAULT_MONTHS = 36;
const ALLOWED_BRAND = 'Kumho'; //     on the allowlist → plan shows
const NON_ALLOWED_BRAND = 'Michelin'; // not on the allowlist → plan hidden

function expectedUnit(tirePrice: number, months: number): number {
  const t = TERMS[months];
  return Math.min(t.max, Math.max(t.min, (tirePrice * t.percent) / 100));
}
function fmtUnit(amt: number): string {
  return amt % 1 === 0 ? amt.toFixed(0) : amt.toFixed(2);
}

/** Find a bookable tire PDP whose brand (the trigger's data-vendor) matches. */
async function findTireByVendor(page: Page, vendor: string): Promise<string | null> {
  await page.goto(`/search?q=${encodeURIComponent(vendor)}`, { waitUntil: 'domcontentloaded' });
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
  for (const href of hrefs.slice(0, 10)) {
    await page.goto(href, { waitUntil: 'domcontentloaded' });
    const btn = page.locator('[onclick*="openBookingModal"][data-vendor][data-tire-price]').first();
    if ((await btn.count()) === 0) continue;
    const v = ((await btn.getAttribute('data-vendor')) || '').trim().toLowerCase();
    if (v === vendor.toLowerCase()) return href;
  }
  return null;
}

async function openModal(page: Page): Promise<number> {
  const btn = page.locator('[onclick*="openBookingModal"][data-vendor][data-tire-price]').first();
  const cents = parseInt((await btn.getAttribute('data-tire-price')) || '0', 10);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  return cents / 100;
}

test.describe('Protection Plan add-on (brand-gated)', () => {
  test(`shows on an allowed brand (${ALLOWED_BRAND}), offers 1/2/3-yr terms, reprices, rolls into total`, async ({
    page,
  }) => {
    const url = await findTireByVendor(page, ALLOWED_BRAND);
    expect(url, `no bookable ${ALLOWED_BRAND} tire found`).toBeTruthy();
    const tirePrice = await openModal(page);

    const row = page.locator('#bk-custom-addons .bk-addon').filter({ hasText: 'Protection Plan' });
    await expect(row).toBeVisible({ timeout: 15_000 });

    const priceLabel = row.locator('.bk-addon-price');
    const termSelect = row.locator('select.bk-addon-term');
    await expect(priceLabel).toHaveText(`+$${fmtUnit(expectedUnit(tirePrice, DEFAULT_MONTHS))}/tire`);
    await expect(termSelect.locator('option')).toHaveCount(3);

    // Switching to the 1-year term reprices live.
    await termSelect.selectOption('12');
    await expect(priceLabel).toHaveText(`+$${fmtUnit(expectedUnit(tirePrice, 12))}/tire`);

    // Ticking it adds a term-labelled line and lifts the total.
    const totalRow = page.locator('#bk-order-total-row');
    const num = (s: string) => parseFloat(s.replace(/[^\d.]/g, ''));
    const before = num(await totalRow.innerText());
    await row.locator('input[type="checkbox"]').check();

    const orderLines = page.locator('#bk-order-lines');
    await expect(orderLines).toContainText('Protection Plan (1 year)');
    const m = (await orderLines.innerText()).match(/Protection Plan \(1 year\) × (\d+)\s*\+\$([\d.]+)/);
    expect(m, 'protection-plan order line not found').toBeTruthy();
    expect(m![2]).toBe((expectedUnit(tirePrice, 12) * parseInt(m![1], 10)).toFixed(2));
    expect(num(await totalRow.innerText())).toBeGreaterThan(before);
  });

  test(`is hidden on a non-allowed brand (${NON_ALLOWED_BRAND})`, async ({ page }) => {
    const url = await findTireByVendor(page, NON_ALLOWED_BRAND);
    test.skip(!url, `no bookable ${NON_ALLOWED_BRAND} tire found to test gating`);
    await openModal(page);
    // Give the modal's /api/services fetch time to resolve, then assert absence.
    await page.waitForTimeout(2500);
    await expect(
      page.locator('#bk-custom-addons .bk-addon').filter({ hasText: 'Protection Plan' }),
    ).toHaveCount(0);
  });
});
