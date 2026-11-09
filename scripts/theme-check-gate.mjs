#!/usr/bin/env node
// Theme Check gate: fail only on offenses that are NEW compared with the
// committed baseline (theme-check-baseline.json).
//
//   shopify theme check --path princetires --output json > theme-check.json
//   node scripts/theme-check-gate.mjs theme-check.json
//   node scripts/theme-check-gate.mjs theme-check.json --write-baseline   # accept today's offenses
//
// Matching is by check + file + message — never by line, so editing a file
// above an old offense does not make it "new". The same offense can appear
// several times in one file (e.g. three <img> tags without width/height), so
// each key carries a count and only an INCREASE is new.
//
// What fails the job (exit 1):
//   - any new offense with severity "error" (LiquidHTMLSyntaxError,
//     MissingAsset, MissingTemplate, ImgWidthAndHeight, ...)
//   - with --strict (or THEME_CHECK_STRICT=1): new warnings too
//   - input that is not Theme Check JSON (the CLI crashed)
// New warnings are otherwise listed in the job summary but do not fail.
// Offenses that disappeared are listed so the baseline can be tightened with
// --write-baseline (the ratchet only ever moves one way in review).

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--') && !a.includes('=')));
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : dflt;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !['--baseline', '--theme-path'].includes(args[i - 1]));

const INPUT = positional[0] || 'theme-check.json';
const BASELINE = opt('--baseline', 'theme-check-baseline.json');
const THEME_PATH = path.resolve(opt('--theme-path', 'princetires'));
const WRITE = flags.has('--write-baseline');
const STRICT = flags.has('--strict') || process.env.THEME_CHECK_STRICT === '1';

/** Theme Check prints JSON, but tolerate a stray banner line around it. */
export function parseThemeCheckOutput(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start === -1 || end <= start) throw new Error('no JSON array in Theme Check output');
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/** Absolute (or odd) paths → theme-relative, forward slashes. */
export function relFile(p, themePath) {
  const rel = path.isAbsolute(p) ? path.relative(themePath, p) : p;
  return rel.split(path.sep).join('/').replace(/^\.\//, '').replace(/^princetires\//, '');
}

export const keyOf = (o) => `${o.check}\u0000${o.file}\u0000${o.message}`;

/** Flatten Theme Check's per-file output into counted offenses. */
export function flatten(results, themePath) {
  if (!Array.isArray(results)) throw new Error('Theme Check output is not an array');
  const map = new Map();
  for (const f of results) {
    if (!f || typeof f.path !== 'string' || !Array.isArray(f.offenses)) {
      throw new Error('unexpected Theme Check entry: ' + JSON.stringify(f).slice(0, 200));
    }
    const file = relFile(f.path, themePath);
    for (const o of f.offenses) {
      const item = { check: o.check, severity: o.severity, file, message: o.message };
      const k = keyOf(item);
      const cur = map.get(k);
      if (cur) {
        cur.count++;
        cur.lines.push(o.start_row != null ? o.start_row + 1 : null);
      } else map.set(k, { ...item, count: 1, lines: [o.start_row != null ? o.start_row + 1 : null] });
    }
  }
  return [...map.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/** Compare current offenses with the baseline. */
export function diff(current, baseline) {
  const base = new Map((baseline || []).map((o) => [keyOf(o), o]));
  const cur = new Map(current.map((o) => [keyOf(o), o]));
  const added = [];
  const fixed = [];
  for (const [k, o] of cur) {
    const was = base.get(k)?.count ?? 0;
    if (o.count > was) added.push({ ...o, newCount: o.count - was });
  }
  for (const [k, o] of base) {
    const now = cur.get(k)?.count ?? 0;
    if (now < o.count) fixed.push({ ...o, fixedCount: o.count - now });
  }
  return { added, fixed };
}

function tally(list, countField = 'count') {
  const t = { error: 0, warning: 0, info: 0 };
  for (const o of list) t[o.severity] = (t[o.severity] || 0) + (o[countField] ?? 1);
  return t;
}

function mdEscape(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 220);
}

function main() {
  const raw = fs.readFileSync(INPUT, 'utf8');
  const current = flatten(parseThemeCheckOutput(raw), THEME_PATH);

  if (WRITE) {
    const doc = {
      _about:
        'Theme Check offenses accepted as of the date below. scripts/theme-check-gate.mjs fails CI only on offenses NOT in this list (matched by check + file + message, with counts; line numbers are ignored). Regenerate with: shopify theme check --path princetires --output json > theme-check.json && node scripts/theme-check-gate.mjs theme-check.json --write-baseline',
      generatedAt: new Date().toISOString(),
      themeCheck: process.env.THEME_CHECK_VERSION || null,
      totals: tally(current),
      offenses: current.map(({ lines, ...o }) => o),
    };
    fs.writeFileSync(BASELINE, JSON.stringify(doc, null, 2) + '\n');
    console.log(`[theme-check] wrote ${BASELINE}: ${current.length} distinct offenses`, doc.totals);
    return;
  }

  if (!fs.existsSync(BASELINE)) {
    console.error(`[theme-check] ${BASELINE} is missing — run with --write-baseline first`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).offenses;
  const { added, fixed } = diff(current, baseline);
  const blocking = added.filter((o) => o.severity === 'error' || (STRICT && o.severity === 'warning'));
  const nonBlocking = added.filter((o) => !blocking.includes(o));

  const t = tally(current);
  const lines = [];
  lines.push('### Shopify Theme Check vs baseline');
  lines.push('');
  lines.push(`Now: ${t.error} errors, ${t.warning} warnings, ${t.info} info. Baseline: ${baseline.length} distinct offenses.`);
  lines.push('');
  lines.push(
    blocking.length
      ? `**FAIL — ${blocking.reduce((n, o) => n + o.newCount, 0)} new ${STRICT ? 'error/warning' : 'error'} offense(s).** Fix them, or if one is truly intended, regenerate the baseline in the same PR (see scripts/theme-check-gate.mjs).`
      : '**OK — no new errors.**',
  );
  const table = (title, list, countField) => {
    if (!list.length) return;
    lines.push('', `#### ${title}`, '', '| Severity | Check | File | Lines (now) | Message |', '| --- | --- | --- | --- | --- |');
    for (const o of list.slice(0, 100)) {
      const ls = (o.lines || []).filter((x) => x != null).join(', ');
      lines.push(`| ${o.severity} | ${o.check} | ${o.file} | ${ls}${o[countField] > 1 ? ` (+${o[countField]})` : ''} | ${mdEscape(o.message)} |`);
    }
    if (list.length > 100) lines.push(`| … | | | | ${list.length - 100} more |`);
  };
  table('New offenses that fail the job', blocking, 'newCount');
  table('New warnings (reported, not blocking)', nonBlocking, 'newCount');
  if (fixed.length) {
    lines.push('', `${fixed.reduce((n, o) => n + o.fixedCount, 0)} baseline offense(s) are gone — regenerate the baseline to lock that in.`);
  }
  const md = lines.join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  // GitHub annotations on the PR diff for blocking offenses.
  if (process.env.GITHUB_ACTIONS) {
    for (const o of blocking) {
      const line = (o.lines || []).find((x) => x != null) || 1;
      console.log(`::error file=princetires/${o.file},line=${line},title=${o.check}::${mdEscape(o.message)}`);
    }
  }
  if (blocking.length) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`[theme-check] ${err.message}`);
  process.exit(1);
}
