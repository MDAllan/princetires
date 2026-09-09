import { test, expect, Page } from '@playwright/test';

/**
 * Protection Plan booking add-on (live site) — formerly "Road Hazard Protection".
 *
 * A per-tire add-on offered in the product booking modal, BRAND-GATED to an admin
 * allowlist (Kumho / Rotalla / Radar / Haida) and hidden on every other brand.
 * Currently a single 1-year term (10% of tire price, $12 floor / $50 cap), so the
 * modal shows no term dropdown. If a customer continues past the add-ons step
 * without it, a one-time "add protection?" nudge appears.
 *
 * If the rate changes, update UNIT; if the allowlist changes, update ALLOWED /
 * NON_ALLOWED.
 */

const RATE = { percent: 10, min: 12, max: 50 };
const ALLOWED_BRAND = 'Kumho';
const NON_ALLOWED_BRAND = 'Michelin';

function expectedUnit(tirePrice: number): number {
  return Math.min(RATE.max, Math.max(RATE.min, (tirePrice * RATE.percent) / 100));
}
function fmtUnit(amt: number): string {
  return amt % 1 === 0 ? amt.toFixed(0) : amt.toFixed(2);
}

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

test.describe('Protection Plan add-on (brand-gated, 1-year)', () => {
  test(`shows on an allowed brand (${ALLOWED_BRAND}) as a single 1-year plan and rolls into the total`, async ({
    page,
  }) => {
    const url = await findTireByVendor(page, ALLOWED_BRAND);
    expect(url, `no bookable ${ALLOWED_BRAND} tire found`).toBeTruthy();
    const tirePrice = await openModal(page);

    const row = page.locator('#bk-custom-addons .bk-addon').filter({ hasText: 'Protection Plan' });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200); // let async saved-vehicle/services loads settle the layout

    // Single term → no dropdown; price = 10% clamped.
    await expect(row.locator('select.bk-addon-term')).toHaveCount(0);
    await expect(row.locator('.bk-addon-price')).toHaveText(`+$${fmtUnit(expectedUnit(tirePrice))}/tire`);

    const totalRow = page.locator('#bk-order-total-row');
    const num = (s: string) => parseFloat(s.replace(/[^\d.]/g, ''));
    const before = num(await totalRow.innerText());
    // Tick via the real change event (avoids the checkbox-in-<label> synthetic
    // double-toggle) — this is the same handler a user's click fires.
    await row.locator('input[type="checkbox"]').evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const orderLines = page.locator('#bk-order-lines');
    await expect(orderLines).toContainText('Protection Plan (1 year)');
    const m = (await orderLines.innerText()).match(/Protection Plan \(1 year\) × (\d+)\s*\+\$([\d.]+)/);
    expect(m, 'protection-plan order line not found').toBeTruthy();
    expect(m![2]).toBe((expectedUnit(tirePrice) * parseInt(m![1], 10)).toFixed(2));
    expect(num(await totalRow.innerText())).toBeGreaterThan(before);
  });

  test(`is hidden on a non-allowed brand (${NON_ALLOWED_BRAND})`, async ({ page }) => {
    const url = await findTireByVendor(page, NON_ALLOWED_BRAND);
    test.skip(!url, `no bookable ${NON_ALLOWED_BRAND} tire found`);
    await openModal(page);
    await page.waitForTimeout(2500);
    await expect(
      page.locator('#bk-custom-addons .bk-addon').filter({ hasText: 'Protection Plan' }),
    ).toHaveCount(0);
  });

  test(`nudges before continuing when the plan is left unticked (${ALLOWED_BRAND})`, async ({ page }) => {
    const url = await findTireByVendor(page, ALLOWED_BRAND);
    expect(url, `no bookable ${ALLOWED_BRAND} tire found`).toBeTruthy();
    await openModal(page);
    await expect(
      page.locator('#bk-custom-addons .bk-addon').filter({ hasText: 'Protection Plan' }),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200); // let the modal settle before clicking Continue

    // Continue without ticking → the nudge appears.
    await page.locator('#bk-step1-cta').click({ force: true });
    const nudge = page.locator('#bk-upsell-nudge');
    await expect(nudge).toBeVisible();
    await expect(nudge).toContainText('Protection Plan');
    await expect(nudge.locator('#bk-nudge-add')).toBeVisible();
  });
});
