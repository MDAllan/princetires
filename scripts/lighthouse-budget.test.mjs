// node --test scripts/  — unit tests for the pure parts of lighthouse-budget.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  median,
  limitFor,
  compare,
  ratchet,
  extractMetrics,
  machineMismatch,
  classifyProductResponse,
  CPU_INDEPENDENT,
} from './lighthouse-budget.mjs';

test('median of 3 ignores one outlier; even counts average; junk is skipped', () => {
  assert.equal(median([3000, 9000, 3100]), 3100);
  assert.equal(median([1, 3]), 2);
  assert.equal(median([null, 5, NaN]), 5);
  assert.equal(median([]), null);
});

test('limits: lower-is-better takes the larger of abs and pct slack; scores subtract', () => {
  assert.equal(limitFor('lcpMs', 2000, { pct: 20, abs: 500 }), 2500); // abs wins
  assert.equal(limitFor('lcpMs', 10000, { pct: 20, abs: 500 }), 12000); // pct wins
  assert.equal(limitFor('performance', 60, { abs: 8 }), 52);
  assert.equal(limitFor('cls', 0.1, { abs: 0.05 }), 0.15000000000000002);
});

const baseline = {
  tolerance: { performance: { abs: 8 }, lcpMs: { pct: 20, abs: 500 } },
  goals: { home: { lcpMs: 4000 } },
  pages: { home: { path: '/', metrics: { performance: 60, lcpMs: 7000, cls: 0.02 } } },
};

test('within tolerance passes, beyond it regresses, goals never fail', () => {
  const ok = compare({ home: { path: '/', metrics: { performance: 55, lcpMs: 8000, cls: 0.03 } } }, baseline);
  assert.equal(ok.regressed, false);
  const lcp = ok.rows.find((r) => r.metric === 'lcpMs');
  assert.equal(lcp.status, 'ok');
  assert.equal(lcp.goalMet, false);

  const bad = compare({ home: { path: '/', metrics: { performance: 50, lcpMs: 7000, cls: 0.02 } } }, baseline);
  assert.equal(bad.regressed, true);
  assert.equal(bad.rows.find((r) => r.metric === 'performance').status, 'REGRESSED');
});

test('a page that could not be measured fails; a page not in the baseline does not', () => {
  assert.equal(compare({ home: { error: 'NO_FCP' } }, baseline).regressed, true);
  const fresh = compare({ booking: { path: '/pages/booking', metrics: { performance: 10 } } }, baseline);
  assert.equal(fresh.regressed, false);
  assert.equal(fresh.rows.find((r) => r.metric === 'performance').status, 'new');
});

test('ratchet only tightens, and only on wins bigger than half the slack', () => {
  // perf: slack 8, +10 → tightened. lcp: worse → kept. cls: slack 0.05, -0.01 → noise, kept.
  const next = ratchet(baseline, { home: { path: '/', metrics: { performance: 70, lcpMs: 9000, cls: 0.01 } } });
  assert.deepEqual(next.pages.home.metrics, { performance: 70, lcpMs: 7000, cls: 0.02 });
  assert.equal(baseline.pages.home.metrics.performance, 60, 'input not mutated');

  // lcp slack at 7000 = max(500, 20% = 1400) → needs > 700 ms better.
  const small = ratchet(baseline, { home: { path: '/', metrics: { performance: 63, lcpMs: 6400, cls: 0.02 } } });
  assert.deepEqual(small.pages.home.metrics, { performance: 60, lcpMs: 7000, cls: 0.02 });
  const big = ratchet(baseline, { home: { path: '/', metrics: { performance: 65, lcpMs: 6200, cls: 0.02 } } });
  assert.deepEqual(big.pages.home.metrics, { performance: 65, lcpMs: 6200, cls: 0.02 });

  // a metric with no baseline value yet is filled in
  assert.equal(ratchet(baseline, { home: { path: '/', metrics: { tbtMs: 300 } } }).pages.home.metrics.tbtMs, 300);
});

test('ratchet leaves a page alone when it was measured on a different URL', () => {
  const b = { pages: { product: { path: '/products/a', metrics: { performance: 60 } } } };
  const next = ratchet(b, { product: { path: '/products/b', metrics: { performance: 99 } } });
  assert.deepEqual(next.pages.product, { path: '/products/a', metrics: { performance: 60 } });
});

test('ratchet on a different machine only touches CPU-independent metrics', () => {
  const b = { pages: { home: { path: '/', metrics: { performance: 60, htmlBytes: 400_000 } } } };
  const next = ratchet(b, { home: { path: '/', metrics: { performance: 90, htmlBytes: 300_000 } } }, { enforce: CPU_INDEPENDENT });
  assert.equal(next.pages.home.metrics.performance, 60);
  assert.equal(next.pages.home.metrics.htmlBytes, 300_000);
});

test('machine mismatch: >35% benchmark difference, or unknown current index', () => {
  assert.equal(machineMismatch(2792, 1200), true); // laptop baseline vs GitHub runner
  assert.equal(machineMismatch(2792, 2300), false); // 18% — same class of machine
  assert.equal(machineMismatch(1200, 1700), true); // 42%
  assert.equal(machineMismatch(2792, null), true); // can't tell → don't enforce CPU metrics
  assert.equal(machineMismatch(null, 1200), false); // old baseline without an index → enforce all
  assert.equal(machineMismatch(undefined, undefined), false);
});

test('on a machine mismatch only CPU-independent metrics can regress', () => {
  const b = {
    benchmarkIndex: 2792,
    pages: { home: { path: '/', metrics: { performance: 63, tbtMs: 155, lcpMs: 4000, htmlBytes: 400_000, cls: 0.02, accessibility: 95 } } },
  };
  // CI-like numbers: everything CPU-bound much worse, sizes unchanged.
  const ci = { home: { path: '/', metrics: { performance: 35, tbtMs: 900, lcpMs: 9000, htmlBytes: 401_000, cls: 0.02, accessibility: 95 } } };
  const r = compare(ci, b, { enforce: CPU_INDEPENDENT });
  assert.equal(r.regressed, false);
  assert.equal(r.rows.find((x) => x.metric === 'tbtMs').status, 'worse (not enforced)');
  assert.equal(compare(ci, b).regressed, true, 'same rows fail when everything is enforced');

  const heavier = { home: { path: '/', metrics: { ...ci.home.metrics, htmlBytes: 500_000 } } };
  const h = compare(heavier, b, { enforce: CPU_INDEPENDENT });
  assert.equal(h.regressed, true);
  assert.equal(h.rows.find((x) => x.metric === 'htmlBytes').status, 'REGRESSED');
});

test('product page: only 404/410 or a redirect away swaps it; 429/5xx/no response retry', () => {
  const p = '/products/185-65r14-90t-haida-hd617';
  assert.equal(classifyProductResponse(200, p, p), 'ok');
  assert.equal(classifyProductResponse(404, p, p), 'gone');
  assert.equal(classifyProductResponse(410, p, p), 'gone');
  assert.equal(classifyProductResponse(200, '/collections/all', p), 'gone');
  assert.equal(classifyProductResponse(429, p, p), 'retry');
  assert.equal(classifyProductResponse(503, p, p), 'retry');
  assert.equal(classifyProductResponse(null, p, p), 'retry');
});

test('extractMetrics reads scores, audits and the main document size', () => {
  const lhr = {
    categories: { performance: { score: 0.62 }, accessibility: { score: 0.91 } },
    audits: {
      'largest-contentful-paint': { numericValue: 7100 },
      'total-blocking-time': { numericValue: 420 },
      'cumulative-layout-shift': { numericValue: 0.01 },
      'first-contentful-paint': { numericValue: 2100 },
      'speed-index': { numericValue: 5000 },
      'total-byte-weight': { numericValue: 3_000_000 },
      'network-requests': { details: { items: [{ resourceType: 'Script', resourceSize: 1 }, { resourceType: 'Document', resourceSize: 1_036_630 }] } },
    },
  };
  const m = extractMetrics(lhr);
  assert.equal(m.performance, 62);
  assert.equal(m.htmlBytes, 1_036_630);
  assert.equal(m.tbtMs, 420);
});
