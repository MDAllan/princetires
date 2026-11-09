#!/usr/bin/env node
// Lighthouse performance budget for the LIVE storefront, as a ratchet.
//
//   node scripts/lighthouse-budget.mjs                  # measure, compare to tests/perf-baseline.json
//   node scripts/lighthouse-budget.mjs --write-baseline # measure and REPLACE the baseline
//   node scripts/lighthouse-budget.mjs --pages home,contact --runs 3
//
// Why a ratchet and not fixed thresholds: today the home page scores ~51 on
// mobile, far under any sensible fixed bar, so a fixed bar is red forever and
// gets ignored. Instead each page must not get WORSE than the committed
// baseline by more than a tolerance. The plan's targets (P3-1) are printed as
// goals, never enforced, until the baseline itself reaches them.
//
// Each page is audited N times (default 3) in a fresh Chromium with a cold
// cache, using Lighthouse's default mobile settings (simulated slow 4G, 4x CPU
// slowdown, moto g power screen — the same as PageSpeed Insights). Each metric
// is the MEDIAN of the runs, so one noisy run can't fail the job: a metric
// fails only when at least 2 of 3 runs are over the limit.
//
// Output: a table on stdout, the same as Markdown in $GITHUB_STEP_SUMMARY when
// set, and perf-results/ (results.json + baseline.candidate.json). The
// candidate is the baseline tightened to any metric that improved, so a
// maintainer can commit it to lock in gains (ratchet only ever tightens).
//
// Read-only: this only loads public pages. It never clicks or submits.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'tests', 'perf-baseline.json');
const OUT_DIR = path.join(ROOT, 'perf-results');
const BASE = (process.env.PERF_BASE_URL || 'https://princetires.ca').replace(/\/$/, '');
const RUN_TIMEOUT_MS = Number(process.env.PERF_RUN_TIMEOUT_MS) || 240_000;
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

/** The pages we budget. `path: null` = resolved at run time. */
export const PAGES = [
  { id: 'home', path: '/' },
  { id: 'product', path: null }, // first tire card on /collections/tires
  { id: 'collection', path: '/collections/tires' },
  { id: 'booking', path: '/pages/booking' },
  { id: 'contact', path: '/pages/contact' },
];

/**
 * Metric definitions. `better` = which direction is good.
 * `round` keeps the committed JSON readable.
 */
export const METRICS = {
  performance: { label: 'Perf score', better: 'higher', unit: '', round: 0 },
  accessibility: { label: 'A11y score', better: 'higher', unit: '', round: 0 },
  lcpMs: { label: 'LCP', better: 'lower', unit: 'ms', round: 0 },
  tbtMs: { label: 'TBT', better: 'lower', unit: 'ms', round: 0 },
  cls: { label: 'CLS', better: 'lower', unit: '', round: 3 },
  fcpMs: { label: 'FCP', better: 'lower', unit: 'ms', round: 0 },
  siMs: { label: 'Speed Index', better: 'lower', unit: 'ms', round: 0 },
  htmlBytes: { label: 'HTML (raw)', better: 'lower', unit: 'B', round: 0 },
  totalBytes: { label: 'Page weight', better: 'lower', unit: 'B', round: 0 },
};

/** Default tolerances, used when the baseline file doesn't set its own. */
export const DEFAULT_TOLERANCE = {
  performance: { abs: 8 },
  accessibility: { abs: 3 },
  lcpMs: { pct: 20, abs: 500 },
  tbtMs: { pct: 30, abs: 150 },
  cls: { abs: 0.05 },
  fcpMs: { pct: 20, abs: 400 },
  siMs: { pct: 25, abs: 600 },
  htmlBytes: { pct: 10 },
  totalBytes: { pct: 15 },
};

// ── pure helpers (exported for reuse) ────────────────────────────────────────

export function median(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** The worst value still allowed for a metric, given its baseline. */
export function limitFor(metric, baseline, tol) {
  const def = METRICS[metric];
  const t = tol || DEFAULT_TOLERANCE[metric] || {};
  const slack = Math.max(t.abs ?? 0, ((t.pct ?? 0) / 100) * Math.abs(baseline));
  return def.better === 'higher' ? baseline - slack : baseline + slack;
}

export function isWorse(metric, value, limit) {
  return METRICS[metric].better === 'higher' ? value < limit : value > limit;
}

export function isBetter(metric, value, baseline) {
  return METRICS[metric].better === 'higher' ? value > baseline : value < baseline;
}

function roundMetric(metric, v) {
  if (v == null) return v;
  const p = 10 ** METRICS[metric].round;
  return Math.round(v * p) / p;
}

function fmt(metric, v) {
  if (v == null) return '—';
  const { unit } = METRICS[metric];
  if (unit === 'B') return v >= 1024 * 1024 ? `${(v / 1024 / 1024).toFixed(2)} MB` : `${Math.round(v / 1024)} KB`;
  if (unit === 'ms') return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
  return String(roundMetric(metric, v));
}

/** Pull our metrics out of one Lighthouse result. */
export function extractMetrics(lhr) {
  const a = lhr.audits || {};
  const num = (id) => (a[id] && typeof a[id].numericValue === 'number' ? a[id].numericValue : null);
  const items = a['network-requests']?.details?.items || [];
  const doc = items.find((i) => i.resourceType === 'Document');
  return {
    performance: lhr.categories?.performance?.score != null ? lhr.categories.performance.score * 100 : null,
    accessibility: lhr.categories?.accessibility?.score != null ? lhr.categories.accessibility.score * 100 : null,
    lcpMs: num('largest-contentful-paint'),
    tbtMs: num('total-blocking-time'),
    cls: num('cumulative-layout-shift'),
    fcpMs: num('first-contentful-paint'),
    siMs: num('speed-index'),
    htmlBytes: doc ? doc.resourceSize ?? null : null,
    totalBytes: num('total-byte-weight'),
  };
}

/**
 * Compare medians to the baseline. Returns rows + whether anything regressed.
 * A page missing from the baseline is reported but does not fail.
 */
export function compare(current, baseline) {
  const rows = [];
  let regressed = false;
  const tolerance = { ...DEFAULT_TOLERANCE, ...(baseline?.tolerance || {}) };
  for (const [pageId, page] of Object.entries(current)) {
    const base = baseline?.pages?.[pageId]?.metrics;
    const goals = baseline?.goals?.[pageId] || {};
    if (page.error) {
      rows.push({ pageId, metric: null, status: 'error', note: page.error });
      regressed = true;
      continue;
    }
    for (const metric of Object.keys(METRICS)) {
      const now = page.metrics[metric];
      const b = base?.[metric];
      const goal = goals[metric];
      const row = { pageId, metric, now, base: b ?? null, goal: goal ?? null, limit: null, status: 'new' };
      if (now == null) {
        row.status = 'missing';
      } else if (b != null) {
        row.limit = limitFor(metric, b, tolerance[metric]);
        if (isWorse(metric, now, row.limit)) {
          row.status = 'REGRESSED';
          regressed = true;
        } else row.status = isBetter(metric, now, b) ? 'better' : 'ok';
      }
      if (goal != null && now != null) {
        row.goalMet = METRICS[metric].better === 'higher' ? now >= goal : now <= goal;
      }
      rows.push(row);
    }
  }
  return { rows, regressed };
}

/** The baseline tightened to every metric that improved (never loosened). */
export function ratchet(baseline, current) {
  const next = JSON.parse(JSON.stringify(baseline || { pages: {} }));
  next.pages = next.pages || {};
  for (const [pageId, page] of Object.entries(current)) {
    if (page.error) continue;
    const entry = (next.pages[pageId] = next.pages[pageId] || { path: page.path, metrics: {} });
    entry.metrics = entry.metrics || {};
    for (const metric of Object.keys(METRICS)) {
      const now = roundMetric(metric, page.metrics[metric]);
      if (now == null) continue;
      const b = entry.metrics[metric];
      if (b == null || isBetter(metric, now, b)) entry.metrics[metric] = now;
    }
  }
  return next;
}

// ── measurement ──────────────────────────────────────────────────────────────

/**
 * The product page to audit: the one the baseline was measured on, so runs
 * compare like with like, unless it is gone (sold out / unpublished); then
 * the first tire card on /collections/tires.
 */
async function resolveProductPath(preferred) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ userAgent: BROWSER_UA });
    const page = await ctx.newPage();
    if (preferred) {
      const res = await page.goto(`${BASE}${preferred}`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
      if (res && res.status() < 400 && new URL(page.url()).pathname === preferred) return preferred;
      console.log(`[perf] baseline product ${preferred} is gone (HTTP ${res ? res.status() : 'error'}); using the first tire card`);
    }
    await page.goto(`${BASE}/collections/tires`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const href = await page
      .locator('a.ptg__card[href*="/products/"], a[href*="/products/"]:visible')
      .first()
      .getAttribute('href', { timeout: 15_000 })
      .catch(() => null);
    if (!href) throw new Error('no product link on /collections/tires');
    return new URL(href, BASE).pathname;
  } finally {
    await browser.close();
  }
}

/**
 * Which Chrome Lighthouse drives. A real Google Chrome install is preferred
 * (GitHub's ubuntu-latest has one; so does a dev laptop): Playwright's
 * "Chrome for Testing" build paints nothing under Lighthouse on macOS
 * (NO_FCP every run, 2026-11-08), so it is only the last resort.
 * Override with CHROME_PATH.
 */
function pickChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const found = chromeLauncher.Launcher.getInstallations();
    if (found.length) return found[0];
  } catch {
    /* fall through */
  }
  return chromium.executablePath();
}

async function auditOnce(url) {
  const chromePath = pickChrome();
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    // Hard cap per run: a hung page must not eat the CI job's whole budget.
    let timer;
    const result = await Promise.race([
      lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility'],
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`run timed out after ${RUN_TIMEOUT_MS / 1000}s`)), RUN_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    const lhr = result?.lhr;
    if (!lhr) throw new Error('Lighthouse returned no result');
    if (lhr.runtimeError) throw new Error(`${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);
    return {
      metrics: extractMetrics(lhr),
      benchmarkIndex: lhr.environment?.benchmarkIndex ?? null,
      hostUserAgent: lhr.environment?.hostUserAgent ?? null,
    };
  } finally {
    await chrome.kill();
  }
}

function parseArgs(argv) {
  const args = { runs: 3, writeBaseline: false, pages: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write-baseline') args.writeBaseline = true;
    else if (a === '--runs') args.runs = Math.max(1, parseInt(argv[++i], 10) || 3);
    else if (a === '--pages') args.pages = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

function markdown(rows, meta) {
  const lines = [];
  lines.push(`### Lighthouse budget (mobile, median of ${meta.runs}) — ${meta.base}`);
  lines.push('');
  lines.push(meta.regressed ? '**Result: REGRESSED** — at least one metric is worse than the baseline allows.' : '**Result: OK** — nothing is worse than the baseline allows.');
  lines.push('');
  lines.push('| Page | Metric | Now | Baseline | Limit | Status | Goal (P3-1) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    if (!r.metric) {
      lines.push(`| ${r.pageId} | — | — | — | — | **${r.status}** | ${r.note} |`);
      continue;
    }
    const goal = r.goal == null ? '' : `${fmt(r.metric, r.goal)} ${r.goalMet ? '(met)' : '(not yet)'}`;
    const status = r.status === 'REGRESSED' ? '**REGRESSED**' : r.status;
    lines.push(`| ${r.pageId} | ${METRICS[r.metric].label} | ${fmt(r.metric, r.now)} | ${fmt(r.metric, r.base)} | ${fmt(r.metric, r.limit)} | ${status} | ${goal} |`);
  }
  lines.push('');
  lines.push(`Pages: ${Object.entries(meta.paths).map(([k, v]) => `${k} = \`${v}\``).join(', ')}. ` +
    `CPU benchmark index (median): ${meta.benchmarkIndex ?? 'n/a'} (baseline machine: ${meta.baselineBenchmark ?? 'n/a'}).`);
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n'));
    return;
  }
  const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : null;
  const pages = PAGES.filter((p) => !args.pages || args.pages.includes(p.id));

  const current = {};
  const paths = {};
  const benchmarks = [];
  let hostUserAgent = null;
  for (const p of pages) {
    let pagePath = p.path;
    try {
      if (!pagePath) pagePath = await resolveProductPath(args.writeBaseline ? null : baseline?.pages?.[p.id]?.path);
    } catch (err) {
      current[p.id] = { path: null, error: `could not resolve URL: ${err.message}` };
      continue;
    }
    paths[p.id] = pagePath;
    const runs = [];
    const errors = [];
    for (let i = 0; i < args.runs; i++) {
      process.stdout.write(`[perf] ${p.id} run ${i + 1}/${args.runs} … `);
      try {
        const t0 = Date.now();
        const r = await auditOnce(`${BASE}${pagePath}`);
        runs.push(r.metrics);
        if (r.benchmarkIndex != null) benchmarks.push(r.benchmarkIndex);
        hostUserAgent = hostUserAgent || r.hostUserAgent;
        console.log(
          `perf ${fmt('performance', r.metrics.performance)}, LCP ${fmt('lcpMs', r.metrics.lcpMs)} (${Math.round((Date.now() - t0) / 1000)}s)`,
        );
      } catch (err) {
        errors.push(String(err.message).split('\n')[0]);
        console.log(`error: ${String(err.message).split('\n')[0]}`);
      }
    }
    // A median needs a majority of good runs.
    if (runs.length < Math.ceil((args.runs + 1) / 2)) {
      current[p.id] = { path: pagePath, error: `only ${runs.length}/${args.runs} runs succeeded (${errors.join('; ')})` };
      continue;
    }
    const metrics = {};
    for (const m of Object.keys(METRICS)) metrics[m] = median(runs.map((r) => r[m]));
    current[p.id] = { path: pagePath, metrics, runs };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const benchmarkIndex = median(benchmarks);

  if (args.writeBaseline) {
    const next = baseline ? JSON.parse(JSON.stringify(baseline)) : {};
    next.measuredAt = new Date().toISOString();
    next.base = BASE;
    next.lighthouse = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/lighthouse/package.json'), 'utf8')).version;
    next.runs = args.runs;
    next.benchmarkIndex = benchmarkIndex == null ? null : Math.round(benchmarkIndex);
    next.hostUserAgent = hostUserAgent;
    next.pages = next.pages || {};
    for (const [id, page] of Object.entries(current)) {
      if (page.error) {
        console.error(`[perf] ${id}: ${page.error} — not written`);
        continue;
      }
      const metrics = {};
      for (const m of Object.keys(METRICS)) metrics[m] = roundMetric(m, page.metrics[m]);
      next.pages[id] = { path: page.path, metrics };
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
    console.log(`[perf] wrote ${path.relative(ROOT, BASELINE_PATH)}`);
  }

  const { rows, regressed } = compare(current, args.writeBaseline ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : baseline);
  const md = markdown(rows, {
    runs: args.runs,
    base: BASE,
    regressed,
    paths,
    benchmarkIndex: benchmarkIndex == null ? null : Math.round(benchmarkIndex),
    baselineBenchmark: baseline?.benchmarkIndex ?? null,
  });
  console.log('\n' + md + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify({ base: BASE, benchmarkIndex, hostUserAgent, current, rows }, null, 2));
  if (baseline) {
    const candidate = ratchet(baseline, current);
    fs.writeFileSync(path.join(OUT_DIR, 'baseline.candidate.json'), JSON.stringify(candidate, null, 2) + '\n');
  }

  if (!baseline && !args.writeBaseline) {
    console.error('[perf] no tests/perf-baseline.json — run with --write-baseline first');
    process.exitCode = 1;
  } else if (regressed && !args.writeBaseline) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
