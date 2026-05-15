// @ts-check
const { test, expect } = require('@playwright/test');

test('diagnose: what events actually land in dataLayer when we click a tab?', async ({ page }) => {
  await page.addInitScript(() => {
    window.__all_pushes = [];
    Object.defineProperty(window, 'dataLayer', {
      configurable: true,
      get() { return this.__dl; },
      set(v) {
        this.__dl = v;
        const orig = v.push.bind(v);
        v.push = function (item) {
          window.__all_pushes.push({ event: item && item.event, full: JSON.stringify(item).slice(0, 200) });
          return orig(item);
        };
      }
    });
  });
  await page.goto('https://princetires.ca/pages/booking');
  await page.locator('[data-bp-path="buy"]').click();
  await page.locator('#bp-buy').waitFor({ state: 'visible' });

  // Snapshot BEFORE clicking the tab
  const before = await page.evaluate(() => window.__all_pushes || []);
  console.log('\n=== PUSHES BEFORE tab click ===');
  before.forEach(p => console.log(`  event=${p.event}  | ${p.full}`));

  // Click vehicle tab
  await page.locator('[data-pt-ts-tab="vehicle"]').click();
  await page.waitForTimeout(500);

  // Snapshot AFTER
  const after = await page.evaluate(() => window.__all_pushes || []);
  console.log(`\n=== ALL PUSHES (${after.length} total, ${after.length - before.length} new since tab click) ===`);
  after.slice(before.length).forEach(p => console.log(`  event=${p.event}  | ${p.full}`));

  // Also check whether window.pt.track exists and works
  const trackInfo = await page.evaluate(() => ({
    hasPt: typeof window.pt,
    hasPtTrack: typeof window.pt?.track,
    ptTrackString: String(window.pt?.track).slice(0, 200)
  }));
  console.log('\n=== window.pt info ===');
  console.log(JSON.stringify(trackInfo, null, 2));

  // Try calling track directly and see if it pushes
  const directPushResult = await page.evaluate(() => {
    if (window.pt && window.pt.track) {
      window.pt.track('tire_search_DIAGNOSTIC', { source: 'direct-eval' });
      return 'called';
    }
    return 'pt.track missing';
  });
  console.log(`\n=== Direct window.pt.track call: ${directPushResult} ===`);
  await page.waitForTimeout(200);
  const afterDirect = await page.evaluate(() => window.__all_pushes || []);
  const diagPush = afterDirect.find(p => p.event === 'tire_search_DIAGNOSTIC');
  console.log(`Captured DIAGNOSTIC push: ${!!diagPush}`);
  if (diagPush) console.log(`  ${diagPush.full}`);

  // Always pass — this is diagnostic only
  expect(true).toBe(true);
});
