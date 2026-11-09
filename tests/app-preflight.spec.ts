import { test, expect } from '@playwright/test';

/**
 * Preflight: can THIS machine's browser reach the booking app?
 *
 * The storefront fetches services, availability and package prices from
 * app.princetires.ca. Vercel's bot protection sometimes answers headless or
 * datacenter traffic (GitHub's runners are Azure IPs) with a 403 "Security
 * Checkpoint" HTML page instead of JSON. Inside the storefront that only shows
 * up as a CORS error and missing UI (no Protection Plan, no road force, no
 * priced packages, no drop-off), which reads like a theme bug. This test names
 * the real cause so nobody chases one.
 *
 * It must use the BROWSER's network stack (page.goto), not `request`/curl:
 * on 2026-11-02 curl got 200 while Chromium got the 403.
 *
 * CI runs it as its own step first (tag @preflight); the main step skips it.
 * Read-only: one GET.
 */
const SERVICES = 'https://app.princetires.ca/api/services';

test('@preflight app.princetires.ca answers this browser with JSON (no Vercel bot checkpoint)', async ({ page }) => {
  const res = await page.goto(SERVICES, { waitUntil: 'domcontentloaded' });
  expect(res, `no response from ${SERVICES}`).not.toBeNull();
  const status = res!.status();
  const type = res!.headers()['content-type'] || '';
  if (status === 403 || /text\/html/.test(type)) {
    const html = (await page.content()).slice(0, 4000);
    const checkpoint = /security checkpoint|vercel/i.test(html);
    throw new Error(
      `${SERVICES} returned HTTP ${status} (${type || 'no content-type'})` +
        (checkpoint ? ' — Vercel Security Checkpoint (bot protection) is blocking this runner.' : '.') +
        ' Specs that need app data (road-hazard add-on, road force, package builder, drop-off) will fail as missing UI.' +
        ' Fix: wait it out, or ask the owner to add a Vercel firewall bypass for the test runner.',
    );
  }
  expect(status, `${SERVICES} status`).toBe(200);
  const body = JSON.parse((await res!.text()) || '{}');
  expect(Array.isArray(body.services) && body.services.length > 0, 'services list is empty').toBe(true);
});
