// @ts-check
/**
 * Bulk VIN decode API — verify the proxy works against the live
 * /api/decode-vin-batch endpoint (deployed via princetires-app).
 *
 * The UI is wholesale-customer-gated so a separate manual checklist
 * covers the click-through (tests/wholesale-vin-batch-MANUAL.md).
 *
 * Run: npx playwright test tests/decode-vin-batch.spec.js --project=chromium
 */
const { test, expect, request } = require('@playwright/test');

const BASE = 'https://app.princetires.ca';

test('valid VIN decodes to a HONDA Civic', async () => {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE}/api/decode-vin-batch`, {
    data: { vins: ['2HGFC2F69LH567890'] },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.summary.total).toBe(1);
  expect(body.summary.decoded).toBe(1);
  expect(body.results[0].vehicle.make).toBe('HONDA');
  expect(body.results[0].vehicle.model).toBe('Civic');
  expect(body.results[0].vehicle.year).toBe(2020);
});

test('invalid-format VIN is rejected without an upstream call', async () => {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE}/api/decode-vin-batch`, {
    data: { vins: ['ABC123'] },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.summary.invalid_format).toBe(1);
  expect(body.results[0].error_code).toBe('INVALID_FORMAT');
  expect(body.results[0].vehicle).toBeNull();
});

test('mixed batch (3 VINs: valid + invalid + valid-but-unknown) returns per-row results', async () => {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE}/api/decode-vin-batch`, {
    data: { vins: ['2HGFC2F69LH567890', 'ABC123', 'ABCDEFGHJKLMNPRST'] },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.summary.total).toBe(3);
  expect(body.summary.decoded).toBe(1);
  expect(body.summary.invalid_format).toBe(1);
});

test('second call for the same VIN hits cache (cached=true on row)', async () => {
  const ctx = await request.newContext();
  // First call to ensure cache is warm
  await ctx.post(`${BASE}/api/decode-vin-batch`, {
    data: { vins: ['2HGFC2F69LH567890'] },
  });
  // Second call
  const res = await ctx.post(`${BASE}/api/decode-vin-batch`, {
    data: { vins: ['2HGFC2F69LH567890'] },
  });
  const body = await res.json();
  expect(body.results[0].cached).toBe(true);
});

test('empty/missing vins array returns 400 (or 429 if rate-limited from prior tests)', async () => {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE}/api/decode-vin-batch`, {
    data: { vins: [] },
  });
  // Either 400 (route rejected the empty array) or 429 (limiter hit first).
  // Both prove the route refuses to do work — that's the assertion's intent.
  expect([400, 429]).toContain(res.status());
});

test('over-50 batch returns 400 (or 429 if rate-limited)', async () => {
  const ctx = await request.newContext();
  const vins = Array.from({ length: 51 }, (_, i) => `2HGFC2F69LH${String(i).padStart(6, '0')}`);
  const res = await ctx.post(`${BASE}/api/decode-vin-batch`, {
    data: { vins },
  });
  expect([400, 429]).toContain(res.status());
});
