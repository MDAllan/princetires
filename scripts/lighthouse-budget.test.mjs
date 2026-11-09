// node --test scripts/  — unit tests for the pure parts of lighthouse-budget.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, limitFor, compare, ratchet, extractMetrics } from './lighthouse-budget.mjs';

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

test('ratchet only tightens', () => {
  const next = ratchet(baseline, { home: { path: '/', metrics: { performance: 70, lcpMs: 9000, cls: 0.01 } } });
  assert.deepEqual(next.pages.home.metrics, { performance: 70, lcpMs: 7000, cls: 0.01 });
  assert.equal(baseline.pages.home.metrics.performance, 60, 'input not mutated');
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
