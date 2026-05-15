// @ts-check
/**
 * One-off diagnostic: test the missing-vehicle webhook directly from a real browser,
 * the same way the storefront JS will call it.
 *
 * Run: npx playwright test tests/webhook-diagnostic.spec.js --project=chromium --reporter=list
 */

const { test, expect } = require('@playwright/test');

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwluHN6zhptSES9izlrsDT4dBJUp_ItwqvdLxa0br49Em6GSiI94CaeE3dVvF69pgSSOQ/exec';

test('A. Browser can POST to the Apps Script webhook', async ({ page }) => {
  // Land on any page in the same origin (we'll use the live booking page).
  // We need a page context for fetch() to work like the storefront would.
  await page.goto('https://princetires.ca/pages/booking');

  // Capture all network responses to the webhook host so we can see what really happened.
  const events = [];
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('script.google.com') || u.includes('script.googleusercontent.com')) {
      let body = '';
      try { body = (await res.text()).slice(0, 300); } catch (e) { body = '<unreadable>'; }
      events.push({ url: u, status: res.status(), body });
    }
  });

  // Make the fetch from inside the page, the way our storefront snippet does it.
  const result = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          vehicle:    'PLAYWRIGHT TEST 2020 Toyota RAV4 XLE',
          year:       '2020',
          make:       'Toyota',
          model:      'RAV4',
          trim:       'XLE',
          page_url:   window.location.href,
          user_agent: navigator.userAgent,
          timestamp:  new Date().toISOString()
        })
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, statusText: res.statusText, bodyPreview: text.slice(0, 300) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, WEBHOOK);

  // Print rich diagnostics regardless of pass/fail
  console.log('\n══════ FETCH RESULT (from the page context) ══════');
  console.log(JSON.stringify(result, null, 2));

  console.log('\n══════ NETWORK RESPONSES seen during the fetch ══════');
  for (const e of events) {
    console.log(`  status=${e.status}  url=${e.url}`);
    console.log(`     body[0..300]: ${e.body.replace(/\n/g, ' ')}`);
  }
  console.log('');

  // The assertion: at least the fetch should not throw and should report ok
  expect(result.ok, `fetch should report ok. Got: ${JSON.stringify(result)}`).toBeTruthy();
});
